window.CBO = window.CBO || {};

window.CBO.initDragScroll = function initDragScroll() {
  const verticalScrollerSelector = [
    ".drawer-content",
    ".right-sidebar-content",
    ".brush-studio-selection-column",
    ".brushes-panel-grid",
    ".brushes-gallery-packages",
    ".brushes-gallery-brushes",
  ].join(",");

  function isInteractiveTarget(target) {
    return Boolean(
      target.closest(
        [
          "button",
          "input",
          "textarea",
          "select",
          "a",
          "[contenteditable='true']",
          "[data-upload-place]",
          "[data-layer-row]",
          ".brush-studio-taper-slider",
          ".brush-studio-grain-blend-outline-box",
          ".layer-sidebar-blend-outline",
        ].join(","),
      ),
    );
  }

  function setGlobalDragging(isDragging) {
    document.body.classList.toggle("cbo-drag-scroll-active", isDragging);
  }

  function bindVerticalDragScroll(scroller) {
    if (!scroller || scroller.dataset.dragScrollReady === "true") {
      return;
    }

    scroller.dataset.dragScrollReady = "true";
    scroller.scrollLeft = 0;

    let isDragging = false;
    let startY = 0;
    let startScrollTop = 0;

    scroller.addEventListener(
      "wheel",
      (event) => {
        if (event.deltaX !== 0) {
          scroller.scrollLeft = 0;
        }
      },
      { passive: true },
    );

    scroller.addEventListener("scroll", () => {
      if (scroller.scrollLeft !== 0) {
        scroller.scrollLeft = 0;
      }
    });

    scroller.addEventListener("pointerdown", (event) => {
      if (
        event.button !== 0 ||
        event.target.closest(".drawer-image-container") ||
        isInteractiveTarget(event.target)
      ) {
        return;
      }

      isDragging = true;
      startY = event.clientY;
      startScrollTop = scroller.scrollTop;
      scroller.classList.add("dragging");
      setGlobalDragging(true);
      scroller.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    scroller.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }

      scroller.scrollTop = startScrollTop - (event.clientY - startY);
      scroller.scrollLeft = 0;
      event.preventDefault();
    });

    function stopDragging(event) {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      scroller.classList.remove("dragging");
      setGlobalDragging(false);

      if (scroller.hasPointerCapture(event.pointerId)) {
        scroller.releasePointerCapture(event.pointerId);
      }
    }

    scroller.addEventListener("pointerup", stopDragging);
    scroller.addEventListener("pointercancel", stopDragging);
    scroller.addEventListener("lostpointercapture", () => {
      isDragging = false;
      scroller.classList.remove("dragging");
      setGlobalDragging(false);
    });
  }

  function bindImageRowDragScroll(row) {
    if (row.dataset.dragScrollReady === "true") {
      return;
    }

    row.dataset.dragScrollReady = "true";

    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let dragMode = null;
    const drawerContent = row.closest(".drawer-content") || document.querySelector(".drawer-content");

    row.addEventListener("pointerdown", (event) => {
      if (event.button !== 0 || isInteractiveTarget(event.target)) {
        return;
      }

      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = row.scrollLeft;
      startScrollTop = drawerContent?.scrollTop || 0;
      dragMode = null;
      row.classList.add("dragging");
      setGlobalDragging(true);
      row.setPointerCapture(event.pointerId);
      event.preventDefault();
    });

    row.addEventListener("pointermove", (event) => {
      if (!isDragging) {
        return;
      }

      const distanceX = event.clientX - startX;
      const distanceY = event.clientY - startY;

      if (!dragMode) {
        const absX = Math.abs(distanceX);
        const absY = Math.abs(distanceY);

        if (absX < 3 && absY < 3) {
          return;
        }

        dragMode = absX > absY ? "horizontal" : "vertical";
      }

      if (dragMode === "horizontal") {
        row.scrollLeft = startScrollLeft - distanceX;
      } else if (drawerContent) {
        drawerContent.scrollTop = startScrollTop - distanceY;
        drawerContent.scrollLeft = 0;
      }

      event.preventDefault();
    });

    function stopDragging(event) {
      if (!isDragging) {
        return;
      }

      isDragging = false;
      dragMode = null;
      row.classList.remove("dragging");
      setGlobalDragging(false);

      if (row.hasPointerCapture(event.pointerId)) {
        row.releasePointerCapture(event.pointerId);
      }
    }

    row.addEventListener("pointerup", stopDragging);
    row.addEventListener("pointercancel", stopDragging);
    row.addEventListener("lostpointercapture", () => {
      isDragging = false;
      dragMode = null;
      row.classList.remove("dragging");
      setGlobalDragging(false);
    });
  }

  function bindAllScrollers() {
    document.querySelectorAll(verticalScrollerSelector).forEach(bindVerticalDragScroll);
    document.querySelectorAll(".drawer-image-container").forEach(bindImageRowDragScroll);
  }

  bindAllScrollers();

  if (!document.body.dataset.dragScrollObserverReady) {
    document.body.dataset.dragScrollObserverReady = "true";

    const observer = new MutationObserver(() => {
      bindAllScrollers();
    });

    observer.observe(document.body, {
      childList: true,
      subtree: true,
    });
  }
};
