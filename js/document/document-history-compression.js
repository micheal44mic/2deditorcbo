(function registerDocumentHistoryCompression(namespace) {
  const RLE_HEADER_BYTES = 4;
  const RLE_RUN_BYTES = 6;
  const RLE_MAX_RUN = 0xFFFF;
  const RLE_ENCODING = "rle-rgba-v1";

  function isUint8Array(value) {
    return value instanceof Uint8Array;
  }

  function writeHeader(output, rawByteLength) {
    output[0] = rawByteLength & 0xFF;
    output[1] = (rawByteLength >>> 8) & 0xFF;
    output[2] = (rawByteLength >>> 16) & 0xFF;
    output[3] = (rawByteLength >>> 24) & 0xFF;
  }

  function readHeader(compressed) {
    return (
      compressed[0] |
      (compressed[1] << 8) |
      (compressed[2] << 16) |
      (compressed[3] << 24)
    ) >>> 0;
  }

  function compressRgba(rawPixels) {
    if (!isUint8Array(rawPixels)) {
      return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
    }

    const rawByteLength = rawPixels.byteLength;

    if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    const maxOutput = RLE_HEADER_BYTES + (rawByteLength / 4) * RLE_RUN_BYTES;
    const output = new Uint8Array(maxOutput);

    writeHeader(output, rawByteLength);

    let outIdx = RLE_HEADER_BYTES;
    let i = 0;

    while (i < rawByteLength) {
      const r = rawPixels[i];
      const g = rawPixels[i + 1];
      const b = rawPixels[i + 2];
      const a = rawPixels[i + 3];
      let count = 1;
      let j = i + 4;

      while (
        j < rawByteLength &&
        count < RLE_MAX_RUN &&
        rawPixels[j] === r &&
        rawPixels[j + 1] === g &&
        rawPixels[j + 2] === b &&
        rawPixels[j + 3] === a
      ) {
        count += 1;
        j += 4;
      }

      if (outIdx + RLE_RUN_BYTES > rawByteLength) {
        return { bytes: rawPixels, encoding: null, rawByteLength };
      }

      output[outIdx] = count & 0xFF;
      output[outIdx + 1] = (count >>> 8) & 0xFF;
      output[outIdx + 2] = r;
      output[outIdx + 3] = g;
      output[outIdx + 4] = b;
      output[outIdx + 5] = a;
      outIdx += RLE_RUN_BYTES;
      i = j;
    }

    if (outIdx >= rawByteLength) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    return {
      bytes: output.subarray(0, outIdx),
      encoding: RLE_ENCODING,
      rawByteLength,
    };
  }

  function decompressRgba(compressed, expectedRawByteLength = 0) {
    if (!isUint8Array(compressed) || compressed.byteLength < RLE_HEADER_BYTES) {
      throw new Error("RLE RGBA: payload non valido");
    }

    const rawByteLength = readHeader(compressed);

    if (rawByteLength <= 0 || rawByteLength % 4 !== 0) {
      throw new Error(`RLE RGBA: dimensione raw non valida (${rawByteLength})`);
    }

    if (expectedRawByteLength > 0 && expectedRawByteLength !== rawByteLength) {
      throw new Error(
        `RLE RGBA: dimensione attesa ${expectedRawByteLength} ma header dichiara ${rawByteLength}`,
      );
    }

    const output = new Uint8Array(rawByteLength);
    const compressedLength = compressed.byteLength;
    let inIdx = RLE_HEADER_BYTES;
    let outIdx = 0;

    while (inIdx < compressedLength) {
      if (inIdx + RLE_RUN_BYTES > compressedLength) {
        throw new Error("RLE RGBA: run troncato");
      }

      const count = compressed[inIdx] | (compressed[inIdx + 1] << 8);
      const r = compressed[inIdx + 2];
      const g = compressed[inIdx + 3];
      const b = compressed[inIdx + 4];
      const a = compressed[inIdx + 5];
      inIdx += RLE_RUN_BYTES;

      const end = outIdx + count * 4;

      if (end > rawByteLength) {
        throw new Error("RLE RGBA: output overflow");
      }

      for (let k = outIdx; k < end; k += 4) {
        output[k] = r;
        output[k + 1] = g;
        output[k + 2] = b;
        output[k + 3] = a;
      }

      outIdx = end;
    }

    if (outIdx !== rawByteLength) {
      throw new Error(
        `RLE RGBA: lunghezza decompressa errata (${outIdx} vs ${rawByteLength})`,
      );
    }

    return output;
  }

  function isCompressedEncoding(encoding) {
    return encoding === RLE_ENCODING;
  }

  function maybeDecompressSnapshotPixels(snapshot) {
    if (!snapshot || !isUint8Array(snapshot.cpuPixels)) {
      return null;
    }

    if (!isCompressedEncoding(snapshot.cpuPixelsEncoding)) {
      return snapshot.cpuPixels;
    }

    const expected = Number(snapshot.cpuRawBytes) || 0;

    return decompressRgba(snapshot.cpuPixels, expected);
  }

  function toMiB(bytes) {
    return Math.round((Math.max(0, Number(bytes) || 0) / 1024 / 1024) * 100) / 100;
  }

  function debugHistoryCompression(options = {}) {
    const history = namespace.documentHistory || {};
    const renderer = namespace.documentRenderer || null;
    const seenObjects = new WeakSet();
    const seenBuffers = new WeakSet();
    const details = [];
    let compressedSnapshotActualBytes = 0;
    let compressedSnapshotEquivalentBytes = 0;
    let otherCpuBufferBytes = 0;
    let rawSnapshotBytes = 0;
    let rawSnapshotEquivalentBytes = 0;
    const summary = {
      compressedSnapshots: 0,
      compressedSnapshotsMiB: 0,
      compressedRawEquivalentMiB: 0,
      compressionRatio: 1,
      coldLayerTargetsMiB: toMiB(renderer?.getHistoryColdRasterTargetBytes?.() || 0),
      coldLayerTargetsRawMiB: toMiB(renderer?.getHistoryColdRasterTargetRawBytes?.() || renderer?.getHistoryColdRasterTargetBytes?.() || 0),
      otherCpuBuffersMiB: 0,
      rawEquivalentMiB: 0,
      rawSnapshots: 0,
      rawSnapshotsMiB: 0,
      redoEntries: Array.isArray(history.redoStack) ? history.redoStack.length : 0,
      totalActualMiB: 0,
      totalSnapshots: 0,
      undoEntries: Array.isArray(history.undoStack) ? history.undoStack.length : 0,
    };

    function countBuffer(view, bucket, rawEquivalentBytes = view?.byteLength || 0, path = "") {
      if (!isUint8Array(view)) {
        return;
      }

      const buffer = view.buffer;

      if (!buffer || seenBuffers.has(buffer)) {
        return;
      }

      seenBuffers.add(buffer);

      const actualBytes = view.byteLength || 0;
      const equivalentBytes = Math.max(actualBytes, Number(rawEquivalentBytes) || 0);

      if (bucket === "compressed") {
        summary.compressedSnapshots += 1;
        compressedSnapshotActualBytes += actualBytes;
        compressedSnapshotEquivalentBytes += equivalentBytes;
        details.push({
          actualMiB: toMiB(actualBytes),
          encoding: RLE_ENCODING,
          path,
          rawMiB: toMiB(equivalentBytes),
          ratio: actualBytes > 0 ? Math.round((equivalentBytes / actualBytes) * 10) / 10 : 1,
        });
        return;
      }

      if (bucket === "rawSnapshot") {
        summary.rawSnapshots += 1;
        rawSnapshotBytes += actualBytes;
        rawSnapshotEquivalentBytes += equivalentBytes;
        details.push({
          actualMiB: toMiB(actualBytes),
          encoding: "raw",
          path,
          rawMiB: toMiB(equivalentBytes),
          ratio: 1,
        });
        return;
      }

      otherCpuBufferBytes += actualBytes;
    }

    function scan(value, path = "history") {
      if (!value || typeof value !== "object") {
        return;
      }

      if (ArrayBuffer.isView?.(value)) {
        countBuffer(value, "other", value.byteLength, path);
        return;
      }

      if (seenObjects.has(value)) {
        return;
      }

      seenObjects.add(value);

      if (isUint8Array(value.cpuPixels)) {
        const isCompressed = isCompressedEncoding(value.cpuPixelsEncoding);
        const rawBytes = Number(value.cpuRawBytes) || value.cpuPixels.byteLength;

        countBuffer(value.cpuPixels, isCompressed ? "compressed" : "rawSnapshot", rawBytes, path);
      }

      Object.entries(value).forEach(([key, child]) => {
        if (
          typeof child === "function" ||
          key === "cpuPixels" ||
          key === "texture" ||
          key === "framebuffer" ||
          key === "gl"
        ) {
          return;
        }

        scan(child, `${path}.${key}`);
      });
    }

    scan(history.undoStack, "undoStack");
    scan(history.redoStack, "redoStack");

    summary.compressedSnapshotsMiB = toMiB(compressedSnapshotActualBytes);
    summary.compressedRawEquivalentMiB = toMiB(compressedSnapshotEquivalentBytes);
    summary.rawSnapshotsMiB = toMiB(rawSnapshotBytes);
    summary.otherCpuBuffersMiB = toMiB(otherCpuBufferBytes);
    summary.rawEquivalentMiB = toMiB(
      compressedSnapshotEquivalentBytes +
      rawSnapshotEquivalentBytes +
      otherCpuBufferBytes,
    );
    summary.totalSnapshots = summary.compressedSnapshots + summary.rawSnapshots;
    summary.totalActualMiB = Math.round((
      summary.compressedSnapshotsMiB +
      summary.rawSnapshotsMiB +
      summary.otherCpuBuffersMiB +
      summary.coldLayerTargetsMiB
    ) * 100) / 100;

    summary.rawEquivalentMiB = Math.round((
      summary.rawEquivalentMiB +
      summary.coldLayerTargetsRawMiB
    ) * 100) / 100;

    summary.compressionRatio = summary.compressedSnapshotsMiB > 0
      ? Math.round((compressedSnapshotEquivalentBytes / compressedSnapshotActualBytes) * 10) / 10
      : 1;

    if (options.log !== false && typeof console !== "undefined") {
      console.log("[CBO] History compression summary", summary);

      if (details.length > 0 && typeof console.table === "function") {
        console.table(details);
      }
    }

    return {
      ...summary,
      details,
    };
  }

  namespace.HistoryCompression = {
    ENCODING: RLE_ENCODING,
    compressRgba,
    debugHistoryCompression,
    decompressRgba,
    isCompressedEncoding,
    maybeDecompressSnapshotPixels,
  };

  namespace.debugHistoryCompression = debugHistoryCompression;
})(window.CBO = window.CBO || {});
