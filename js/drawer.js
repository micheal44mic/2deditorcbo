window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const templates = window.CBO_TEMPLATES || [];
  const mockupCategories = window.CBO_MOCKUP_CATEGORIES || [];
  const drawerPanel = document.querySelector(".left-drawer");
  const drawerPanelTitle = document.querySelector(".drawer-panel-title");
  const uploadPanelButton = document.querySelector(".drawer-upload-panel-button");
  const layerActionButtons = document.querySelectorAll(
    ".drawer-new-layer-button, .drawer-copy-layer-button, .drawer-new-folder-button",
  );
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");
  const previewLimit = 6;
  const uploadDbName = "cbo-editor-uploads";
  const uploadDbVersion = 1;
  const uploadStoreName = "images";
  const uploadPreviewUrls = new Map();
  const uploadedImages = [];
  let scrollbarFrame = 0;
  let activePanel = "elements";
  let activeCategory = null;
  let uploadDbPromise = null;
  let uploadInput = null;
  let uploadGrid = null;
  let uploadUsageValue = null;
  let uploadUsageFill = null;
  let uploadStatus = null;
  let uploadPointerActivation = null;
  let uploadDragDepth = 0;
  let lastUploadPlaceActivation = {
    at: 0,
    id: "",
  };
  const uploadTouchActivationMoveTolerance = 10;
  const uploadActivationDedupeMs = 650;
  const uploadUriPrefix = "cbo-upload://";
  let uploadExternalImportBusy = false;

  const existingScrollbar = drawerPanel.querySelector(".drawer-custom-scrollbar");

  if (existingScrollbar) {
    existingScrollbar.remove();
  }

  const customScrollbar = document.createElement("div");
  const customScrollbarThumb = document.createElement("div");
  customScrollbar.className = "drawer-custom-scrollbar";
  customScrollbarThumb.className = "drawer-custom-scrollbar-thumb";
  customScrollbar.append(customScrollbarThumb);
  drawerPanel.append(customScrollbar);

  layerActionButtons.forEach((button) => {
    button.addEventListener("click", () => {
      button.classList.add("active");
      window.setTimeout(() => {
        button.classList.remove("active");
      }, 140);
    });
  });

  function getItemTags(item) {
    return Array.isArray(item) ? item : item.tags || [];
  }

  function getItemSrc(item) {
    return Array.isArray(item) ? "" : item.src || "";
  }

  function getItemAlt(item, categoryTitle) {
    return Array.isArray(item) ? categoryTitle : item.alt || item.name || categoryTitle;
  }

  function getItemName(item, categoryTitle) {
    return Array.isArray(item) ? categoryTitle : item.name || item.alt || categoryTitle;
  }

  function isMockupItem(item) {
    return !Array.isArray(item) && (item.type === "mockup" || item.mockup === true);
  }

  function getMockupItemById(id) {
    const normalizedId = String(id || "").trim();

    if (!normalizedId) {
      return null;
    }

    for (const category of mockupCategories) {
      const match = (category.items || []).find((item) => !Array.isArray(item) && item.id === normalizedId);

      if (match) {
        return {
          ...match,
          category: category.title,
        };
      }
    }

    return null;
  }

  function createMockupOpenDetail(mockupItem) {
    return {
      artboardHeight: mockupItem.artboardHeight || 2048,
      artboardWidth: mockupItem.artboardWidth || 2048,
      category: mockupItem.category || "",
      id: mockupItem.id || "",
      name: getItemName(mockupItem, "Mockup"),
      placement: mockupItem.placement || null,
      src: getItemSrc(mockupItem),
    };
  }

  function openMockupItem(mockupItem) {
    const detail = createMockupOpenDetail(mockupItem);

    if (!detail.src) {
      return;
    }

    window.CBO.closeDrawerPanel?.();

    if (window.CBO.openMockupAsset) {
      Promise.resolve(window.CBO.openMockupAsset(detail)).catch((error) => {
        console.warn("Impossibile aprire il mockup.", error);
      });
      return;
    }

    window.dispatchEvent(new CustomEvent("cbo:open-mockup-asset", { detail }));
  }

  function createImagePlaceholder(categoryTitle, categoryItem, index) {
    const tags = getItemTags(categoryItem);
    const src = getItemSrc(categoryItem);
    const mockupItem = isMockupItem(categoryItem);
    const item = document.createElement(mockupItem ? "button" : "span");
    item.className = "drawer-image-placeholder";
    item.dataset.tags = tags.join(" ");
    item.dataset.category = categoryTitle.toLowerCase();
    item.dataset.preview = index < previewLimit ? "true" : "false";

    if (mockupItem) {
      const itemName = getItemName(categoryItem, categoryTitle);

      item.classList.add("drawer-mockup-placeholder");
      item.type = "button";
      item.dataset.mockupId = categoryItem.id || "";
      item.setAttribute("aria-label", `Open ${itemName}`);
      item.title = itemName;
    }

    if (src) {
      const image = document.createElement("img");
      image.className = "drawer-image";

      if (mockupItem || categoryItem.fit === "contain") {
        image.classList.add("drawer-image-contain");
      }

      image.src = src;
      image.alt = getItemAlt(categoryItem, categoryTitle);
      image.loading = "lazy";
      item.append(image);
    }

    if (mockupItem) {
      const label = document.createElement("span");

      label.className = "drawer-image-label";
      label.textContent = getItemName(categoryItem, categoryTitle);
      item.append(label);
    }

    return item;
  }

  function createUploadPanel() {
    const panel = document.createElement("section");
    panel.className = "drawer-upload-panel";
    panel.setAttribute("aria-label", "Uploaded media");

    const input = document.createElement("input");
    input.className = "drawer-upload-input";
    input.type = "file";
    input.accept = "image/*,video/*";
    input.multiple = true;
    input.dataset.uploadInput = "";

    const usage = document.createElement("div");
    usage.className = "drawer-upload-usage";

    const usageLine = document.createElement("div");
    usageLine.className = "drawer-upload-usage-line";

    const usageLabel = document.createElement("span");
    usageLabel.className = "drawer-upload-usage-label";
    usageLabel.textContent = "CACHE";

    const usageValue = document.createElement("span");
    usageValue.className = "drawer-upload-usage-value";
    usageValue.dataset.uploadUsageValue = "";
    usageValue.textContent = "0 GB";

    const usageMeter = document.createElement("div");
    usageMeter.className = "drawer-upload-usage-meter";
    usageMeter.setAttribute("aria-hidden", "true");

    const usageFill = document.createElement("div");
    usageFill.className = "drawer-upload-usage-fill";
    usageFill.dataset.uploadUsageFill = "";

    usageLine.append(usageLabel, usageValue);
    usageMeter.append(usageFill);
    usage.append(usageLine, usageMeter);

    const grid = document.createElement("div");
    grid.className = "drawer-upload-grid";
    grid.dataset.uploadGrid = "";

    const leftColumn = document.createElement("div");
    const rightColumn = document.createElement("div");
    leftColumn.className = "drawer-upload-column";
    rightColumn.className = "drawer-upload-column";
    leftColumn.dataset.uploadColumn = "";
    rightColumn.dataset.uploadColumn = "";
    grid.append(leftColumn, rightColumn);

    const status = document.createElement("div");
    status.className = "drawer-upload-status";
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    status.dataset.uploadStatus = "";

    panel.append(input, usage, grid, status);

    return panel;
  }

  function openUploadDb() {
    if (!("indexedDB" in window)) {
      return Promise.reject(new Error("IndexedDB is not available"));
    }

    if (uploadDbPromise) {
      return uploadDbPromise;
    }

    uploadDbPromise = new Promise((resolve, reject) => {
      const request = window.indexedDB.open(uploadDbName, uploadDbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;

        if (!db.objectStoreNames.contains(uploadStoreName)) {
          db.createObjectStore(uploadStoreName, { keyPath: "id" });
        }
      };

      request.onsuccess = () => {
        resolve(request.result);
      };

      request.onerror = () => {
        uploadDbPromise = null;
        reject(request.error || new Error("Unable to open upload storage"));
      };

      request.onblocked = () => {
        uploadDbPromise = null;
        reject(new Error("Upload storage is blocked"));
      };
    });

    return uploadDbPromise;
  }

  function getStoredUploadedImages() {
    return openUploadDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(uploadStoreName, "readonly");
          const request = transaction.objectStore(uploadStoreName).getAll();

          request.onsuccess = () => {
            resolve(request.result || []);
          };

          request.onerror = () => {
            reject(request.error || new Error("Unable to read uploads"));
          };

          transaction.onerror = () => {
            reject(transaction.error || new Error("Unable to read uploads"));
          };
        }),
    );
  }

  function getStoredUploadedImageById(id) {
    const normalizedId = String(id || "").trim();

    if (!normalizedId) {
      return Promise.resolve(null);
    }

    return openUploadDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(uploadStoreName, "readonly");
          const request = transaction.objectStore(uploadStoreName).get(normalizedId);

          request.onsuccess = () => {
            resolve(request.result || null);
          };

          request.onerror = () => {
            reject(request.error || new Error("Unable to read upload"));
          };

          transaction.onerror = () => {
            reject(transaction.error || new Error("Unable to read upload"));
          };
        }),
    );
  }

  function saveUploadedImage(record) {
    return openUploadDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(uploadStoreName, "readwrite");

          transaction.objectStore(uploadStoreName).put(record);
          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(transaction.error || new Error("Unable to save upload"));
          };
        }),
    );
  }

  function deleteUploadedImageRecord(id) {
    return openUploadDb().then(
      (db) =>
        new Promise((resolve, reject) => {
          const transaction = db.transaction(uploadStoreName, "readwrite");

          transaction.objectStore(uploadStoreName).delete(id);
          transaction.oncomplete = () => {
            resolve();
          };
          transaction.onerror = () => {
            reject(transaction.error || new Error("Unable to delete upload"));
          };
        }),
    );
  }

  function isImageFile(file) {
    return (
      file?.type?.startsWith("image/") ||
      /\.(avif|gif|jpe?g|png|svg|webp)$/i.test(file?.name || "")
    );
  }

  function isVideoFile(file) {
    return (
      file?.type?.startsWith("video/") ||
      /\.(m4v|mov|mp4|ogv|webm)$/i.test(file?.name || "")
    );
  }

  function isUploadMediaFile(file) {
    return isImageFile(file) || isVideoFile(file);
  }

  function getUploadMediaKind(fileOrRecord) {
    return (
      isVideoFile(fileOrRecord) ||
      isVideoFile(fileOrRecord?.blob) ||
      fileOrRecord?.kind === "video"
    )
      ? "video"
      : "image";
  }

  function createUploadId() {
    if (window.crypto?.randomUUID) {
      return window.crypto.randomUUID();
    }

    return `upload-${Date.now()}-${Math.random().toString(16).slice(2)}`;
  }

  function getImageDimensions(file) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const image = new Image();

      image.onload = () => {
        const dimensions = {
          height: image.naturalHeight || image.height || 0,
          width: image.naturalWidth || image.width || 0,
        };

        URL.revokeObjectURL(objectUrl);
        resolve(dimensions);
      };

      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ height: 0, width: 0 });
      };

      image.src = objectUrl;
    });
  }

  function getVideoDimensions(file) {
    return new Promise((resolve) => {
      const objectUrl = URL.createObjectURL(file);
      const video = document.createElement("video");

      video.preload = "metadata";
      video.muted = true;
      video.playsInline = true;
      video.onloadedmetadata = () => {
        const dimensions = {
          duration: Number.isFinite(video.duration) ? video.duration : 0,
          height: video.videoHeight || 0,
          width: video.videoWidth || 0,
        };

        URL.revokeObjectURL(objectUrl);
        resolve(dimensions);
      };
      video.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        resolve({ duration: 0, height: 0, width: 0 });
      };
      video.src = objectUrl;
    });
  }

  function getUploadMediaDimensions(fileOrRecord) {
    const mediaSource = fileOrRecord?.blob || fileOrRecord;

    return getUploadMediaKind(fileOrRecord) === "video"
      ? getVideoDimensions(mediaSource)
      : getImageDimensions(mediaSource);
  }

  async function createUploadRecord(file) {
    const kind = getUploadMediaKind(file);
    const dimensions = await getUploadMediaDimensions(file);

    return {
      id: createUploadId(),
      kind,
      name: file.name || (kind === "video" ? "Uploaded video" : "Uploaded image"),
      type: file.type || (kind === "video" ? "video/*" : "image/*"),
      size: file.size || 0,
      createdAt: Date.now(),
      blob: file,
      ...dimensions,
    };
  }

  function setUploadStatus(message = "") {
    if (uploadStatus) {
      uploadStatus.textContent = message;
    }
  }

  function getUploadedBytes() {
    return uploadedImages.reduce(
      (total, record) => total + (Number(record.size) || Number(record.blob?.size) || 0),
      0,
    );
  }

  function formatStorageBytes(bytes) {
    const safeBytes = Math.max(0, Number(bytes) || 0);

    if (safeBytes === 0) {
      return "0 B";
    }

    if (safeBytes < 1024) {
      return `${Math.round(safeBytes)} B`;
    }

    const kilobytes = safeBytes / 1024;

    if (kilobytes < 1024) {
      return `${kilobytes < 10 ? kilobytes.toFixed(1) : Math.round(kilobytes)} KB`;
    }

    const megabytes = kilobytes / 1024;

    if (megabytes < 1024) {
      return `${megabytes < 10 ? megabytes.toFixed(1) : Math.round(megabytes)} MB`;
    }

    const gigabytes = megabytes / 1024;

    return `${gigabytes < 10 ? gigabytes.toFixed(2) : Math.round(gigabytes)} GB`;
  }

  async function updateUploadUsage() {
    const uploadedBytes = getUploadedBytes();
    let quotaBytes = 0;

    if (navigator.storage?.estimate) {
      try {
        const estimate = await navigator.storage.estimate();

        quotaBytes = Number(estimate.quota) || 0;
      } catch (error) {
        console.warn("Unable to estimate upload storage quota", error);
      }
    }

    if (uploadUsageValue) {
      uploadUsageValue.textContent = quotaBytes
        ? `${formatStorageBytes(uploadedBytes)} / ${formatStorageBytes(quotaBytes)}`
        : formatStorageBytes(uploadedBytes);
    }

    if (uploadUsageFill) {
      const progress = quotaBytes ? Math.min((uploadedBytes / quotaBytes) * 100, 100) : 0;
      const visualProgress = uploadedBytes > 0 ? Math.max(progress, 2) : 0;

      uploadUsageFill.style.width = `${visualProgress}%`;
    }
  }

  function getUploadPreviewUrl(record) {
    if (uploadPreviewUrls.has(record.id)) {
      return uploadPreviewUrls.get(record.id);
    }

    const url = URL.createObjectURL(record.blob);

    uploadPreviewUrls.set(record.id, url);

    return url;
  }

  function createUploadUri(id) {
    const normalizedId = String(id || "").trim();

    return normalizedId ? `${uploadUriPrefix}${encodeURIComponent(normalizedId)}` : "";
  }

  function getUploadIdFromUri(value) {
    const src = String(value || "").trim();

    if (!src.startsWith(uploadUriPrefix)) {
      return "";
    }

    try {
      return decodeURIComponent(src.slice(uploadUriPrefix.length));
    } catch (_error) {
      return src.slice(uploadUriPrefix.length);
    }
  }

  function getUploadedImageRecordById(id) {
    const normalizedId = String(id || "").trim();

    return normalizedId
      ? uploadedImages.find((record) => record.id === normalizedId) || null
      : null;
  }

  function upsertUploadedImageRecord(record) {
    if (!record?.id) {
      return null;
    }

    const existingIndex = uploadedImages.findIndex((uploadedImage) => uploadedImage.id === record.id);

    if (existingIndex >= 0) {
      uploadedImages.splice(existingIndex, 1, record);
      return record;
    }

    uploadedImages.unshift(record);
    return record;
  }

  async function resolveUploadedImageRecord(id) {
    let record = getUploadedImageRecordById(id);

    if (record) {
      return record;
    }

    record = await getStoredUploadedImageById(id);

    if (!record) {
      return null;
    }

    if (!record.width || !record.height) {
      Object.assign(record, await getUploadMediaDimensions(record));
    }

    upsertUploadedImageRecord(record);
    renderUploadedImages();

    return record;
  }

  function getUploadedImageObjectUrl(id) {
    const record = getUploadedImageRecordById(id);

    return record ? getUploadPreviewUrl(record) : "";
  }

  async function resolveUploadedImageObjectUrl(id) {
    const record = await resolveUploadedImageRecord(id);

    return record ? getUploadPreviewUrl(record) : "";
  }

  function revokeUploadPreviewUrl(id) {
    const previewUrl = uploadPreviewUrls.get(id);

    if (previewUrl) {
      URL.revokeObjectURL(previewUrl);
      uploadPreviewUrls.delete(id);
    }
  }

  function createUploadedImageCard(record) {
    const card = document.createElement("div");
    const kind = getUploadMediaKind(record);
    card.className = "drawer-upload-card";
    card.title = record.name;
    card.tabIndex = 0;
    card.dataset.uploadPlace = record.id;
    card.setAttribute("role", "button");
    card.setAttribute(
      "aria-label",
      kind === "video"
        ? `Create video board from ${record.name || "uploaded video"}`
        : `Place ${record.name || "uploaded image"} on canvas`,
    );

    const media = document.createElement(kind === "video" ? "video" : "img");

    media.className = "drawer-upload-thumb";
    media.src = getUploadPreviewUrl(record);

    if (kind === "video") {
      media.muted = true;
      media.playsInline = true;
      media.preload = "metadata";
      media.setAttribute("aria-label", record.name || "Uploaded video");
    } else {
      media.alt = record.name || "Uploaded image";
      media.loading = "lazy";
    }

    const removeButton = document.createElement("button");
    removeButton.className = "drawer-upload-remove";
    removeButton.type = "button";
    removeButton.dataset.uploadRemove = record.id;
    removeButton.setAttribute("aria-label", `Remove ${record.name || "uploaded media"}`);
    removeButton.innerHTML = `
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M18 6 6 18" />
        <path d="m6 6 12 12" />
      </svg>
    `;

    card.append(media, removeButton);

    return card;
  }

  function getUploadAspectRatio(record) {
    return Number(record.width) > 0 && Number(record.height) > 0
      ? Number(record.width) / Number(record.height)
      : 1;
  }

  function getShortestUploadColumn(columns) {
    return columns.reduce((shortestColumn, column) =>
      column.dataset.stackHeight < shortestColumn.dataset.stackHeight ? column : shortestColumn,
    );
  }

  function closeDrawerAfterUploadPlacement() {
    window.CBO.closeDrawerPanel?.();
  }

  function placeUploadedImage(id) {
    const record = uploadedImages.find((uploadedImage) => uploadedImage.id === id);

    if (!record) {
      return;
    }

    closeDrawerAfterUploadPlacement();

    if (getUploadMediaKind(record) === "video") {
      window.CBO.createAiImageBoardFromUpload?.({
        clientX: window.innerWidth * 0.5,
        clientY: window.innerHeight * 0.5,
        duration: record.duration,
        height: record.height,
        kind: "video",
        name: record.name || "Uploaded video",
        src: createUploadUri(record.id),
        uploadId: record.id,
        width: record.width,
      });
      setUploadStatus("VIDEO BOARD");
      return;
    }

    const detail = {
      id: record.id,
      name: record.name,
      blob: record.blob,
    };

    if (window.CBO.placeUploadedImageOnCanvas) {
      window.CBO.placeUploadedImageOnCanvas(detail);
      return;
    }

    window.dispatchEvent(
      new CustomEvent("cbo:place-uploaded-image", {
        detail,
      }),
    );
  }

  function getUploadPlaceCardFromEvent(event) {
    return event.target?.closest?.("[data-upload-place]") || null;
  }

  function isUploadRemoveEventTarget(event) {
    return Boolean(event.target?.closest?.("[data-upload-remove]"));
  }

  function didPointerEndInsideUploadCard(event, uploadCard) {
    if (!uploadCard || typeof document.elementFromPoint !== "function") {
      return false;
    }

    const endTarget = document.elementFromPoint(event.clientX, event.clientY);

    return endTarget instanceof Element && uploadCard.contains(endTarget);
  }

  function activateUploadedImageCard(uploadCard) {
    const uploadId = String(uploadCard?.dataset?.uploadPlace || "").trim();

    if (!uploadId) {
      return false;
    }

    const now = Date.now();

    if (
      lastUploadPlaceActivation.id === uploadId &&
      now - lastUploadPlaceActivation.at < uploadActivationDedupeMs
    ) {
      return true;
    }

    lastUploadPlaceActivation = {
      at: now,
      id: uploadId,
    };
    placeUploadedImage(uploadId);
    return true;
  }

  function renderUploadedImages() {
    if (!uploadGrid) {
      return;
    }

    const columns = Array.from(uploadGrid.querySelectorAll("[data-upload-column]"));

    if (columns.length < 2) {
      return;
    }

    columns.forEach((column) => {
      column.dataset.stackHeight = "0";
      column.replaceChildren();
    });

    uploadedImages.forEach((record) => {
      const column = getShortestUploadColumn(columns);
      const card = createUploadedImageCard(record);
      const aspectRatio = getUploadAspectRatio(record);
      const nextStackHeight = Number(column.dataset.stackHeight || "0") + 1 / aspectRatio;

      column.dataset.stackHeight = String(nextStackHeight);
      column.append(card);
    });
    void updateUploadUsage();
    scheduleCustomScrollbarUpdate();
  }

  async function loadUploadedImages() {
    try {
      const records = await getStoredUploadedImages();

      records.sort((first, second) => second.createdAt - first.createdAt);

      for (const record of records) {
        if (!record.width || !record.height) {
          Object.assign(record, await getUploadMediaDimensions(record));
        }
      }

      uploadedImages.splice(0, uploadedImages.length, ...records);
      renderUploadedImages();
    } catch (error) {
      console.warn("Upload storage unavailable", error);
    }
  }

  function getImageFileExtension(type) {
    const normalizedType = String(type || "").toLowerCase();

    if (normalizedType.includes("jpeg") || normalizedType.includes("jpg")) {
      return "jpg";
    }

    if (normalizedType.includes("webp")) {
      return "webp";
    }

    if (normalizedType.includes("gif")) {
      return "gif";
    }

    if (normalizedType.includes("svg")) {
      return "svg";
    }

    if (normalizedType.includes("avif")) {
      return "avif";
    }

    return "png";
  }

  function getVideoFileExtension(type) {
    const normalizedType = String(type || "").toLowerCase();

    if (normalizedType.includes("webm")) {
      return "webm";
    }

    if (normalizedType.includes("ogg") || normalizedType.includes("ogv")) {
      return "ogv";
    }

    if (normalizedType.includes("quicktime") || normalizedType.includes("mov")) {
      return "mov";
    }

    if (normalizedType.includes("x-m4v") || normalizedType.includes("m4v")) {
      return "m4v";
    }

    return "mp4";
  }

  function getUploadMediaFileExtension(type, kind) {
    return kind === "video" ? getVideoFileExtension(type) : getImageFileExtension(type);
  }

  function createNamedUploadMediaFile(blob, namePrefix = "media") {
    if (blob instanceof File && blob.name) {
      return blob;
    }

    const kind = getUploadMediaKind(blob);
    const type = blob?.type || (kind === "video" ? "video/mp4" : "image/png");
    const extension = getUploadMediaFileExtension(type, kind);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    const name = `${namePrefix}-${stamp}.${extension}`;

    try {
      return new File([blob], name, {
        lastModified: Date.now(),
        type,
      });
    } catch (_error) {
      blob.name = name;
      blob.lastModified = Date.now();
      return blob;
    }
  }

  function getUploadMediaFilesFromDataTransfer(dataTransfer, namePrefix = "media") {
    if (!dataTransfer) {
      return [];
    }

    const fileList = Array.from(dataTransfer.files || [])
      .filter(isUploadMediaFile)
      .map((file) => createNamedUploadMediaFile(file, namePrefix));

    if (fileList.length > 0) {
      return fileList;
    }

    return Array.from(dataTransfer.items || [])
      .filter((item) => (
        item?.kind === "file" &&
        (
          String(item.type || "").startsWith("image/") ||
          String(item.type || "").startsWith("video/")
        )
      ))
      .map((item) => item.getAsFile?.())
      .filter(isUploadMediaFile)
      .map((file) => createNamedUploadMediaFile(file, namePrefix));
  }

  function dataTransferHasUploadMedia(dataTransfer) {
    if (!dataTransfer) {
      return false;
    }

    if (Array.from(dataTransfer.items || []).some((item) => (
      item?.kind === "file" &&
      (
        String(item.type || "").startsWith("image/") ||
        String(item.type || "").startsWith("video/")
      )
    ))) {
      return true;
    }

    return Array.from(dataTransfer.files || []).some(isUploadMediaFile);
  }

  function isEditablePasteTarget(target) {
    const element = target instanceof Element ? target : target?.parentElement;

    return Boolean(element?.closest?.(
      "input, textarea, select, [contenteditable=''], [contenteditable='true'], [role='textbox']",
    ));
  }

  function createAiBoardsForUploadedMedia(records, options = {}) {
    if (typeof window.CBO.createAiImageBoardFromUpload !== "function") {
      return [];
    }

    return records
      .map((record, index) => {
        const kind = getUploadMediaKind(record);

        return window.CBO.createAiImageBoardFromUpload({
          clientX: Number(options.clientX) + index * 18,
          clientY: Number(options.clientY) + index * 18,
          duration: record.duration,
          height: record.height,
          kind,
          name: record.name || (kind === "video" ? "Uploaded video" : "Uploaded image"),
          src: createUploadUri(record.id),
          uploadId: record.id,
          width: record.width,
        });
      })
      .filter(Boolean);
  }

  async function importUploadedImageFiles(files, options = {}) {
    const mediaFiles = Array.from(files || [])
      .filter(isUploadMediaFile)
      .map((file) => createNamedUploadMediaFile(file, options.namePrefix || "uploaded-media"));

    if (!mediaFiles.length) {
      setUploadStatus("MEDIA ONLY");
      return {
        boards: [],
        records: [],
        storedPersistently: false,
      };
    }

    const records = await Promise.all(mediaFiles.map(createUploadRecord));
    let storedPersistently = true;

    await window.CBO.requestPersistentStorage?.({
      source: "upload-cache",
    });

    for (const record of records) {
      try {
        await saveUploadedImage(record);
      } catch (error) {
        storedPersistently = false;
        console.warn("Upload was kept for this session only", error);
      }
    }

    records.slice().reverse().forEach(upsertUploadedImageRecord);
    renderUploadedImages();

    const boards = options.createAiBoard
      ? createAiBoardsForUploadedMedia(records, options)
      : [];

    if (options.openUploadPanel) {
      window.CBO.openDrawerPanel?.("upload");
    }

    setUploadStatus(
      storedPersistently
        ? boards.length
          ? "SAVED + BOARD"
          : "SAVED"
        : boards.length
          ? "SESSION + BOARD"
          : "SESSION ONLY",
    );

    return {
      boards,
      records,
      storedPersistently,
    };
  }

  async function handleExternalMediaImport(files, options = {}) {
    if (uploadExternalImportBusy) {
      return null;
    }

    uploadExternalImportBusy = true;

    try {
      return await importUploadedImageFiles(files, {
        createAiBoard: true,
        namePrefix: options.namePrefix || "imported-media",
        openUploadPanel: true,
        ...options,
      });
    } finally {
      uploadExternalImportBusy = false;
    }
  }

  async function handleUploadFiles() {
    const files = Array.from(uploadInput?.files || []);

    uploadInput.value = "";

    if (!files.length) {
      return;
    }

    await importUploadedImageFiles(files, {
      createAiBoard: false,
      namePrefix: "uploaded-media",
      openUploadPanel: false,
      source: "file-picker",
    });
  }

  async function removeUploadedImage(id) {
    const recordIndex = uploadedImages.findIndex((record) => record.id === id);

    if (recordIndex === -1) {
      return;
    }

    uploadedImages.splice(recordIndex, 1);
    revokeUploadPreviewUrl(id);
    renderUploadedImages();

    try {
      await deleteUploadedImageRecord(id);
      setUploadStatus(uploadedImages.length ? "SAVED" : "");
    } catch (error) {
      setUploadStatus("SESSION ONLY");
      console.warn("Unable to remove stored upload", error);
    }
  }

  function bindUploadPanel() {
    uploadInput = drawerContent.querySelector("[data-upload-input]");
    uploadGrid = drawerContent.querySelector("[data-upload-grid]");
    uploadUsageValue = drawerContent.querySelector("[data-upload-usage-value]");
    uploadUsageFill = drawerContent.querySelector("[data-upload-usage-fill]");
    uploadStatus = drawerContent.querySelector("[data-upload-status]");

    uploadPanelButton?.addEventListener("click", () => {
      uploadInput?.click();
    });

    uploadInput?.addEventListener("change", handleUploadFiles);

    uploadGrid?.addEventListener("pointerdown", (event) => {
      if (
        event.pointerType !== "touch" ||
        event.button !== 0 ||
        isUploadRemoveEventTarget(event)
      ) {
        return;
      }

      const uploadCard = getUploadPlaceCardFromEvent(event);

      if (!uploadCard) {
        return;
      }

      uploadPointerActivation = {
        card: uploadCard,
        pointerId: event.pointerId,
        startX: event.clientX,
        startY: event.clientY,
      };
    });

    uploadGrid?.addEventListener("pointerup", (event) => {
      if (
        event.pointerType !== "touch" ||
        !uploadPointerActivation ||
        uploadPointerActivation.pointerId !== event.pointerId
      ) {
        return;
      }

      const state = uploadPointerActivation;
      uploadPointerActivation = null;

      const distance = Math.hypot(event.clientX - state.startX, event.clientY - state.startY);

      if (
        distance > uploadTouchActivationMoveTolerance ||
        !didPointerEndInsideUploadCard(event, state.card)
      ) {
        return;
      }

      activateUploadedImageCard(state.card);
    });

    uploadGrid?.addEventListener("pointercancel", (event) => {
      if (uploadPointerActivation?.pointerId === event.pointerId) {
        uploadPointerActivation = null;
      }
    });

    uploadGrid?.addEventListener("click", (event) => {
      const removeButton = event.target.closest("[data-upload-remove]");

      if (removeButton) {
        void removeUploadedImage(removeButton.dataset.uploadRemove);
        return;
      }

      const uploadCard = getUploadPlaceCardFromEvent(event);

      if (uploadCard) {
        activateUploadedImageCard(uploadCard);
      }
    });

    uploadGrid?.addEventListener("keydown", (event) => {
      if (event.target.closest("[data-upload-remove]")) {
        return;
      }

      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      const uploadCard = event.target.closest("[data-upload-place]");

      if (uploadCard) {
        event.preventDefault();
        placeUploadedImage(uploadCard.dataset.uploadPlace);
      }
    });
  }

  function setUploadDropActive(isActive) {
    document.body?.classList.toggle("cbo-upload-drop-active", Boolean(isActive));
  }

  function clearUploadDropActive() {
    uploadDragDepth = 0;
    setUploadDropActive(false);
  }

  function bindExternalMediaImport() {
    document.addEventListener("dragenter", (event) => {
      if (!dataTransferHasUploadMedia(event.dataTransfer)) {
        return;
      }

      uploadDragDepth += 1;
      setUploadDropActive(true);
      event.preventDefault();
    });

    document.addEventListener("dragover", (event) => {
      if (!dataTransferHasUploadMedia(event.dataTransfer)) {
        return;
      }

      event.preventDefault();
      event.dataTransfer.dropEffect = "copy";
      setUploadDropActive(true);
    });

    document.addEventListener("dragleave", (event) => {
      if (!dataTransferHasUploadMedia(event.dataTransfer) && uploadDragDepth === 0) {
        return;
      }

      uploadDragDepth = Math.max(0, uploadDragDepth - 1);

      if (uploadDragDepth === 0) {
        setUploadDropActive(false);
      }
    });

    document.addEventListener("dragend", clearUploadDropActive);

    document.addEventListener("drop", (event) => {
      if (!dataTransferHasUploadMedia(event.dataTransfer)) {
        clearUploadDropActive();
        return;
      }

      const files = getUploadMediaFilesFromDataTransfer(event.dataTransfer, "dropped-media");

      event.preventDefault();
      clearUploadDropActive();

      if (!files.length) {
        setUploadStatus("MEDIA ONLY");
        return;
      }

      void handleExternalMediaImport(files, {
        clientX: event.clientX,
        clientY: event.clientY,
        namePrefix: "dropped-media",
        source: "drop",
      });
    });

    document.addEventListener("paste", (event) => {
      if (isEditablePasteTarget(event.target)) {
        return;
      }

      const files = getUploadMediaFilesFromDataTransfer(event.clipboardData, "pasted-media");

      if (!files.length) {
        return;
      }

      event.preventDefault();
      void handleExternalMediaImport(files, {
        clientX: window.innerWidth * 0.5,
        clientY: window.innerHeight * 0.5,
        namePrefix: "pasted-media",
        source: "paste",
      });
    });
  }

  function matchesTags(tags, queryTags) {
    return (
      queryTags.length === 0 ||
      queryTags.every((queryTag) => tags.some((tag) => tag.includes(queryTag)))
    );
  }

  function updateCustomScrollbar() {
    const maxScroll = drawerContent.scrollHeight - drawerContent.clientHeight;
    const trackHeight = customScrollbar.clientHeight;

    customScrollbar.classList.toggle("visible", maxScroll > 1);

    if (maxScroll <= 1 || trackHeight <= 0) {
      customScrollbarThumb.style.height = "0px";
      customScrollbarThumb.style.transform = "translateY(0)";
      return;
    }

    const thumbHeight = Math.max(
      24,
      (drawerContent.clientHeight / drawerContent.scrollHeight) * trackHeight,
    );
    const maxThumbTop = trackHeight - thumbHeight;
    const thumbTop = (drawerContent.scrollTop / maxScroll) * maxThumbTop;

    customScrollbarThumb.style.height = `${thumbHeight}px`;
    customScrollbarThumb.style.transform = `translateY(${thumbTop}px)`;
  }

  function scheduleCustomScrollbarUpdate() {
    if (scrollbarFrame) {
      return;
    }

    scrollbarFrame = requestAnimationFrame(() => {
      scrollbarFrame = 0;
      updateCustomScrollbar();
    });
  }

  function createCategorySection(category, sectionClass) {
    const section = document.createElement("section");
    section.className = `drawer-section ${sectionClass}`;
    section.dataset.category = category.title.toLowerCase();
    section.setAttribute("aria-label", category.title);

    const header = document.createElement("div");
    header.className = "drawer-section-header";

    const title = document.createElement("h2");
    title.className = "drawer-section-title";
    title.textContent = category.title;

    const seeAll = document.createElement("button");
    seeAll.className = "drawer-section-link";
    seeAll.type = "button";
    seeAll.textContent = "SEE ALL";
    seeAll.dataset.categoryFilter = category.title.toLowerCase();

    const backButton = document.createElement("button");
    backButton.className = "drawer-back-button";
    backButton.type = "button";
    backButton.setAttribute("aria-label", "Back to all sections");
    backButton.dataset.categoryBack = "";
    backButton.innerHTML = window.CBO.icons.backToSections;

    const row = document.createElement("div");
    row.className = "drawer-image-container";

    category.items.forEach((categoryItem, index) => {
      row.append(createImagePlaceholder(category.title, categoryItem, index));
    });

    const seeAllCard = document.createElement("button");
    seeAllCard.className = "drawer-see-all-card";
    seeAllCard.type = "button";
    seeAllCard.setAttribute("aria-label", `See all ${category.title}`);
    seeAllCard.dataset.categoryFilter = category.title.toLowerCase();
    seeAllCard.innerHTML = window.CBO.icons.seeAll;

    row.append(seeAllCard);
    header.append(title, seeAll, backButton);
    section.append(header, row);

    return section;
  }

  function getActiveCategoryPanel() {
    if (activePanel === "mockups") {
      return {
        categories: mockupCategories,
        sectionSelector: ".drawer-mockup-section",
      };
    }

    return {
      categories,
      sectionSelector: ".drawer-elements-section",
    };
  }

  function renderDrawer() {
    drawerContent.replaceChildren();

    const searchResults = document.createElement("div");
    searchResults.className = "drawer-search-results";
    drawerContent.append(searchResults);

    const templateGrid = document.createElement("div");
    templateGrid.className = "drawer-template-grid";
    drawerContent.append(templateGrid);

    const mockupSections = document.createElement("div");
    mockupSections.className = "drawer-mockup-sections";
    drawerContent.append(mockupSections);

    drawerContent.append(createUploadPanel());

    const layersPanel = document.createElement("div");
    layersPanel.className = "drawer-layers-panel";
    drawerContent.append(layersPanel);

    templates.forEach((templateItem, index) => {
      const item = createImagePlaceholder("template", templateItem, index);
      item.classList.add("drawer-template-placeholder");
      templateGrid.append(item);
    });

    categories.forEach((category) => {
      drawerContent.append(createCategorySection(category, "drawer-elements-section"));
    });

    mockupCategories.forEach((category) => {
      mockupSections.append(createCategorySection(category, "drawer-mockup-section"));
    });
  }

  function renderSearchResults(queryTags, categoryList) {
    const searchResults = drawerContent.querySelector(".drawer-search-results");
    searchResults.replaceChildren();

    categoryList.forEach((category) => {
      const categoryKey = category.title.toLowerCase();

      if (activeCategory && categoryKey !== activeCategory) {
        return;
      }

      category.items.forEach((categoryItem, index) => {
        const tags = getItemTags(categoryItem).map((tag) => tag.toLowerCase());

        if (matchesTags(tags, queryTags)) {
          searchResults.append(createImagePlaceholder(category.title, categoryItem, index));
        }
      });
    });
  }

  function filterTemplates(queryTags) {
    const templateItems = drawerContent.querySelectorAll(".drawer-template-grid [data-tags]");

    templateItems.forEach((item) => {
      const tags = item.dataset.tags.toLowerCase().split(/\s+/);
      item.classList.toggle("hidden", !matchesTags(tags, queryTags));
    });
  }

  function filterMockups(queryTags) {
    const mockupItems = drawerContent.querySelectorAll(".drawer-mockup-section [data-tags]");

    mockupItems.forEach((item) => {
      const tags = item.dataset.tags.toLowerCase().split(/\s+/);
      item.classList.toggle("hidden", !matchesTags(tags, queryTags));
    });
  }

  function normalizeSearch(value) {
    return value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/^#/, ""))
      .filter(Boolean);
  }

  function filterDrawerSections() {
    if (activePanel === "upload" || activePanel === "layers") {
      drawerContent.classList.remove("category-mode", "search-mode");
      filterTemplates([]);
      filterMockups([]);
      scheduleCustomScrollbarUpdate();
      return;
    }

    if (activePanel === "template") {
      drawerContent.classList.remove("category-mode", "search-mode");
      const queryTags = normalizeSearch(searchInput.value);
      filterTemplates(queryTags);
      filterMockups([]);
      scheduleCustomScrollbarUpdate();
      return;
    }

    const activeCategoryPanel = getActiveCategoryPanel();
    const queryTags = normalizeSearch(searchInput.value);
    const sections = drawerContent.querySelectorAll(activeCategoryPanel.sectionSelector);
    const isSearchMode = queryTags.length > 0;
    const hasCategoryScope = Boolean(activeCategory);
    const isCategoryMode = hasCategoryScope && !isSearchMode;

    drawerContent.classList.toggle("category-mode", isCategoryMode);
    drawerContent.classList.toggle("search-mode", isSearchMode);

    if (isSearchMode) {
      renderSearchResults(queryTags, activeCategoryPanel.categories);
    }

    sections.forEach((section) => {
      const sectionCategory = section.dataset.category;
      const items = Array.from(section.querySelectorAll("[data-tags]"));
      const seeAllCard = section.querySelector(".drawer-see-all-card");
      let visibleItems = 0;

      items.forEach((item) => {
        const tags = item.dataset.tags.toLowerCase().split(/\s+/);
        const matchesCategory = !hasCategoryScope || item.dataset.category === activeCategory;
        const matchesQuery = matchesTags(tags, queryTags);
        const fitsPreview = isCategoryMode || isSearchMode || item.dataset.preview === "true";
        const isVisible = matchesCategory && matchesQuery && fitsPreview;

        item.classList.toggle("hidden", !isVisible);

        if (isVisible) {
          visibleItems += 1;
        }
      });

      section.classList.toggle(
        "hidden",
        (hasCategoryScope && sectionCategory !== activeCategory) || visibleItems === 0,
      );
      seeAllCard.classList.toggle("hidden", isSearchMode || isCategoryMode);
    });

    scheduleCustomScrollbarUpdate();
  }

  function updateDrawerPanel() {
    const isTemplatePanel = activePanel === "template";
    const isMockupPanel = activePanel === "mockups";
    const isUploadPanel = activePanel === "upload";
    const isLayersPanel = activePanel === "layers";
    drawerPanel.dataset.drawerPanel = activePanel;
    drawerPanelTitle.textContent = isUploadPanel ? "UPLOAD" : isLayersPanel ? "LAYERS" : "";
    drawerContent.classList.toggle("template-mode", isTemplatePanel);
    drawerContent.classList.toggle("mockup-mode", isMockupPanel);
    drawerContent.classList.toggle("upload-mode", isUploadPanel);
    drawerContent.classList.toggle("layers-mode", isLayersPanel);
    activeCategory = null;
    searchInput.value = "";
    filterDrawerSections();
    drawerContent.scrollTop = 0;
    scheduleCustomScrollbarUpdate();
  }

  window.CBO.setDrawerPanel = function setDrawerPanel(panelName) {
    activePanel = ["template", "mockups", "upload", "layers"].includes(panelName)
      ? panelName
      : "elements";
    updateDrawerPanel();
  };

  window.CBO.createUploadUri = createUploadUri;
  window.CBO.getUploadIdFromUri = getUploadIdFromUri;
  window.CBO.getUploadedImageObjectUrl = getUploadedImageObjectUrl;
  window.CBO.importUploadedImageFiles = importUploadedImageFiles;
  window.CBO.importUploadedMediaFiles = importUploadedImageFiles;
  window.CBO.isUploadUri = function isUploadUri(value) {
    return String(value || "").trim().startsWith(uploadUriPrefix);
  };
  window.CBO.resolveUploadedImageObjectUrl = resolveUploadedImageObjectUrl;

  renderDrawer();
  bindUploadPanel();
  bindExternalMediaImport();
  void loadUploadedImages();
  updateDrawerPanel();

  drawerContent.addEventListener("scroll", scheduleCustomScrollbarUpdate);
  window.addEventListener("resize", scheduleCustomScrollbarUpdate);

  customScrollbar.addEventListener("pointerdown", (event) => {
    if (event.target !== customScrollbar) {
      return;
    }

    const trackRect = customScrollbar.getBoundingClientRect();
    const thumbRect = customScrollbarThumb.getBoundingClientRect();
    const maxScroll = drawerContent.scrollHeight - drawerContent.clientHeight;
    const maxThumbTop = customScrollbar.clientHeight - customScrollbarThumb.offsetHeight;
    const clickTop = event.clientY - trackRect.top - thumbRect.height / 2;

    if (maxScroll > 0 && maxThumbTop > 0) {
      drawerContent.scrollTop =
        (Math.max(0, Math.min(clickTop, maxThumbTop)) / maxThumbTop) * maxScroll;
    }

    event.preventDefault();
  });

  customScrollbarThumb.addEventListener("pointerdown", (event) => {
    const startY = event.clientY;
    const startScrollTop = drawerContent.scrollTop;

    customScrollbar.classList.add("dragging");
    customScrollbarThumb.setPointerCapture(event.pointerId);

    function handlePointerMove(moveEvent) {
      const maxScroll = drawerContent.scrollHeight - drawerContent.clientHeight;
      const maxThumbTop = customScrollbar.clientHeight - customScrollbarThumb.offsetHeight;

      if (maxScroll > 0 && maxThumbTop > 0) {
        drawerContent.scrollTop =
          startScrollTop + ((moveEvent.clientY - startY) / maxThumbTop) * maxScroll;
      }

      moveEvent.preventDefault();
    }

    function stopDragging(endEvent) {
      customScrollbar.classList.remove("dragging");
      customScrollbarThumb.removeEventListener("pointermove", handlePointerMove);
      customScrollbarThumb.removeEventListener("pointerup", stopDragging);
      customScrollbarThumb.removeEventListener("pointercancel", stopDragging);

      if (customScrollbarThumb.hasPointerCapture(endEvent.pointerId)) {
        customScrollbarThumb.releasePointerCapture(endEvent.pointerId);
      }
    }

    customScrollbarThumb.addEventListener("pointermove", handlePointerMove);
    customScrollbarThumb.addEventListener("pointerup", stopDragging);
    customScrollbarThumb.addEventListener("pointercancel", stopDragging);
    event.preventDefault();
  });

  scheduleCustomScrollbarUpdate();

  searchInput.addEventListener("input", () => {
    filterDrawerSections();
    drawerContent.scrollTop = 0;
  });
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    filterDrawerSections();
    searchInput.focus();
  });

  drawerContent.addEventListener("click", (event) => {
    const mockupButton = event.target.closest("[data-mockup-id]");

    if (mockupButton) {
      const mockupItem = getMockupItemById(mockupButton.dataset.mockupId);

      if (mockupItem) {
        openMockupItem(mockupItem);
      }

      return;
    }

    const backButton = event.target.closest("[data-category-back]");

    if (backButton) {
      activeCategory = null;
      searchInput.value = "";
      filterDrawerSections();
      drawerContent.scrollTop = 0;
      return;
    }

    const filterButton = event.target.closest("[data-category-filter]");

    if (!filterButton) {
      return;
    }

    activeCategory = filterButton.dataset.categoryFilter;
    searchInput.value = "";
    filterDrawerSections();
    drawerContent.scrollTop = 0;
  });

  window.addEventListener("beforeunload", () => {
    uploadPreviewUrls.forEach((previewUrl) => {
      URL.revokeObjectURL(previewUrl);
    });
    uploadPreviewUrls.clear();
  });
};
