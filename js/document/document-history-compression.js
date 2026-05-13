(function registerDocumentHistoryCompression(namespace) {
  const RLE_HEADER_BYTES = 4;
  const RLE_RUN_BYTES = 6;
  const RLE_MAX_RUN = 0xFFFF;
  const RLE_PACKET_HEADER_BYTES = 2;
  const RLE_PACKET_LITERAL_FLAG = 0x8000;
  const RLE_PACKET_MAX_COUNT = 0x7FFF;
  const RLE_PACKET_MIN_RUN = 3;
  const RLE_V2_HEADER_BYTES = 8;
  const RLE_V2_MAGIC_0 = 0x52;
  const RLE_V2_MAGIC_1 = 0x4C;
  const RLE_V2_MAGIC_2 = 0x45;
  const RLE_V2_MAGIC_3 = 0x32;
  const LEGACY_RLE_ENCODING = "rle-rgba-v1";
  const RLE_ENCODING = "rle-rgba-v2";

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

  function writePacketHeader(output, offset, value) {
    output[offset] = value & 0xFF;
    output[offset + 1] = (value >>> 8) & 0xFF;
  }

  function pixelsMatch(rawPixels, firstIndex, secondIndex) {
    return (
      rawPixels[firstIndex] === rawPixels[secondIndex] &&
      rawPixels[firstIndex + 1] === rawPixels[secondIndex + 1] &&
      rawPixels[firstIndex + 2] === rawPixels[secondIndex + 2] &&
      rawPixels[firstIndex + 3] === rawPixels[secondIndex + 3]
    );
  }

  function hasV2Magic(bytes) {
    return Boolean(
      bytes?.byteLength >= RLE_V2_HEADER_BYTES &&
        bytes[4] === RLE_V2_MAGIC_0 &&
        bytes[5] === RLE_V2_MAGIC_1 &&
        bytes[6] === RLE_V2_MAGIC_2 &&
        bytes[7] === RLE_V2_MAGIC_3
    );
  }

  function validateRawByteLength(rawByteLength, expectedRawByteLength = 0) {
    if (rawByteLength <= 0 || rawByteLength % 4 !== 0) {
      throw new Error(`RLE RGBA: dimensione raw non valida (${rawByteLength})`);
    }

    if (expectedRawByteLength > 0 && expectedRawByteLength !== rawByteLength) {
      throw new Error(
        `RLE RGBA: dimensione attesa ${expectedRawByteLength} ma header dichiara ${rawByteLength}`,
      );
    }
  }

  function compressRgbaV1(rawPixels) {
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
      encoding: LEGACY_RLE_ENCODING,
      rawByteLength,
    };
  }

  function compressRgbaV2(rawPixels) {
    if (!isUint8Array(rawPixels)) {
      return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
    }

    const rawByteLength = rawPixels.byteLength;

    if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    const pixelCount = rawByteLength / 4;
    const maxPackets = Math.ceil(pixelCount / RLE_PACKET_MAX_COUNT);
    const output = new Uint8Array(rawByteLength + RLE_V2_HEADER_BYTES + maxPackets * RLE_PACKET_HEADER_BYTES);
    let outIdx = RLE_V2_HEADER_BYTES;
    let pixelIndex = 0;
    let literalStart = 0;
    let literalCount = 0;

    writeHeader(output, rawByteLength);
    output[4] = RLE_V2_MAGIC_0;
    output[5] = RLE_V2_MAGIC_1;
    output[6] = RLE_V2_MAGIC_2;
    output[7] = RLE_V2_MAGIC_3;

    const flushLiteral = () => {
      let remaining = literalCount;
      let start = literalStart;

      while (remaining > 0) {
        const chunk = Math.min(remaining, RLE_PACKET_MAX_COUNT);
        const sourceStart = start * 4;
        const sourceEnd = sourceStart + chunk * 4;

        writePacketHeader(output, outIdx, RLE_PACKET_LITERAL_FLAG | chunk);
        outIdx += RLE_PACKET_HEADER_BYTES;
        output.set(rawPixels.subarray(sourceStart, sourceEnd), outIdx);
        outIdx += chunk * 4;
        start += chunk;
        remaining -= chunk;
      }

      literalStart = pixelIndex;
      literalCount = 0;
    };

    const writeRun = (startPixel, count) => {
      let remaining = count;
      const sourceStart = startPixel * 4;

      while (remaining > 0) {
        const chunk = Math.min(remaining, RLE_PACKET_MAX_COUNT);

        writePacketHeader(output, outIdx, chunk);
        outIdx += RLE_PACKET_HEADER_BYTES;
        output[outIdx] = rawPixels[sourceStart];
        output[outIdx + 1] = rawPixels[sourceStart + 1];
        output[outIdx + 2] = rawPixels[sourceStart + 2];
        output[outIdx + 3] = rawPixels[sourceStart + 3];
        outIdx += 4;
        remaining -= chunk;
      }
    };

    while (pixelIndex < pixelCount) {
      const byteIndex = pixelIndex * 4;
      let runCount = 1;

      while (
        pixelIndex + runCount < pixelCount &&
        runCount < RLE_PACKET_MAX_COUNT &&
        pixelsMatch(rawPixels, byteIndex, (pixelIndex + runCount) * 4)
      ) {
        runCount += 1;
      }

      if (runCount >= RLE_PACKET_MIN_RUN) {
        flushLiteral();
        writeRun(pixelIndex, runCount);
        pixelIndex += runCount;
        literalStart = pixelIndex;
        continue;
      }

      literalCount += runCount;
      pixelIndex += runCount;

      if (literalCount >= RLE_PACKET_MAX_COUNT) {
        flushLiteral();
      }
    }

    flushLiteral();

    if (outIdx >= rawByteLength) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    return {
      bytes: output.subarray(0, outIdx),
      encoding: RLE_ENCODING,
      rawByteLength,
    };
  }

  function chooseBestCompression(rawPixels, candidates) {
    return candidates.reduce(
      (best, candidate) => {
        if (!candidate?.encoding || !(candidate.bytes instanceof Uint8Array)) {
          return best;
        }

        if (candidate.bytes.byteLength >= best.bytes.byteLength) {
          return best;
        }

        return candidate;
      },
      { bytes: rawPixels, encoding: null, rawByteLength: rawPixels?.byteLength || 0 },
    );
  }

  function compressRgba(rawPixels) {
    if (!isUint8Array(rawPixels)) {
      return { bytes: rawPixels, encoding: null, rawByteLength: 0 };
    }

    const rawByteLength = rawPixels.byteLength;

    if (rawByteLength === 0 || rawByteLength % 4 !== 0) {
      return { bytes: rawPixels, encoding: null, rawByteLength };
    }

    return chooseBestCompression(rawPixels, [
      compressRgbaV1(rawPixels),
      compressRgbaV2(rawPixels),
    ]);
  }

  function decompressRgbaV1(compressed, expectedRawByteLength = 0) {
    if (!isUint8Array(compressed) || compressed.byteLength < RLE_HEADER_BYTES) {
      throw new Error("RLE RGBA: payload non valido");
    }

    const rawByteLength = readHeader(compressed);

    validateRawByteLength(rawByteLength, expectedRawByteLength);

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

  function decompressRgbaV2(compressed, expectedRawByteLength = 0) {
    if (!isUint8Array(compressed) || compressed.byteLength < RLE_V2_HEADER_BYTES || !hasV2Magic(compressed)) {
      throw new Error("RLE RGBA v2: payload non valido");
    }

    const rawByteLength = readHeader(compressed);

    validateRawByteLength(rawByteLength, expectedRawByteLength);

    const output = new Uint8Array(rawByteLength);
    const compressedLength = compressed.byteLength;
    let inIdx = RLE_V2_HEADER_BYTES;
    let outIdx = 0;

    while (inIdx < compressedLength) {
      if (inIdx + RLE_PACKET_HEADER_BYTES > compressedLength) {
        throw new Error("RLE RGBA v2: packet troncato");
      }

      const header = compressed[inIdx] | (compressed[inIdx + 1] << 8);
      const isLiteral = (header & RLE_PACKET_LITERAL_FLAG) !== 0;
      const count = header & ~RLE_PACKET_LITERAL_FLAG;

      inIdx += RLE_PACKET_HEADER_BYTES;

      if (count <= 0) {
        throw new Error("RLE RGBA v2: count non valido");
      }

      const byteCount = count * 4;
      const end = outIdx + byteCount;

      if (end > rawByteLength) {
        throw new Error("RLE RGBA v2: output overflow");
      }

      if (isLiteral) {
        if (inIdx + byteCount > compressedLength) {
          throw new Error("RLE RGBA v2: literal troncato");
        }

        output.set(compressed.subarray(inIdx, inIdx + byteCount), outIdx);
        inIdx += byteCount;
        outIdx = end;
        continue;
      }

      if (inIdx + 4 > compressedLength) {
        throw new Error("RLE RGBA v2: run troncato");
      }

      const r = compressed[inIdx];
      const g = compressed[inIdx + 1];
      const b = compressed[inIdx + 2];
      const a = compressed[inIdx + 3];

      inIdx += 4;

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
        `RLE RGBA v2: lunghezza decompressa errata (${outIdx} vs ${rawByteLength})`,
      );
    }

    return output;
  }

  function decompressRgba(compressed, expectedRawByteLength = 0, encoding = "") {
    const normalizedEncoding = String(encoding || "").trim();

    if (normalizedEncoding === RLE_ENCODING || (!normalizedEncoding && hasV2Magic(compressed))) {
      return decompressRgbaV2(compressed, expectedRawByteLength);
    }

    if (normalizedEncoding && normalizedEncoding !== LEGACY_RLE_ENCODING) {
      throw new Error(`RLE RGBA: encoding non supportato (${normalizedEncoding})`);
    }

    return decompressRgbaV1(compressed, expectedRawByteLength);
  }

  function isCompressedEncoding(encoding) {
    return encoding === RLE_ENCODING || encoding === LEGACY_RLE_ENCODING;
  }

  function maybeDecompressSnapshotPixels(snapshot) {
    if (!snapshot || !isUint8Array(snapshot.cpuPixels)) {
      return null;
    }

    if (!isCompressedEncoding(snapshot.cpuPixelsEncoding)) {
      return snapshot.cpuPixels;
    }

    const expected = Number(snapshot.cpuRawBytes) || 0;

    return decompressRgba(snapshot.cpuPixels, expected, snapshot.cpuPixelsEncoding);
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

    function countBuffer(view, bucket, rawEquivalentBytes = view?.byteLength || 0, path = "", encoding = "") {
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
          encoding: encoding || RLE_ENCODING,
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

        countBuffer(
          value.cpuPixels,
          isCompressed ? "compressed" : "rawSnapshot",
          rawBytes,
          path,
          value.cpuPixelsEncoding || "",
        );
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
