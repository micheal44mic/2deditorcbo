window.CBO = window.CBO || {};

window.CBO.initDragScroll = function initDragScroll() {
  const drawerContent = document.querySelector(".drawer-content");
  const imageRows = document.querySelectorAll(".drawer-image-container");
  let isDrawerDragging = false;
  let drawerStartY = 0;
  let drawerStartScrollTop = 0;

  drawerContent.addEventListener("pointerdown", (event) => {
    const isInteractive =
      event.target.closest(".drawer-image-container") ||
      event.target.closest("button") ||
      event.target.closest("input");

    if (isInteractive) {
      return;
    }

    isDrawerDragging = true;
    drawerStartY = event.clientY;
    drawerStartScrollTop = drawerContent.scrollTop;
    drawerContent.classList.add("dragging");
    drawerContent.setPointerCapture(event.pointerId);
  });

  drawerContent.addEventListener("pointermove", (event) => {
    if (!isDrawerDragging) {
      return;
    }

    drawerContent.scrollTop = drawerStartScrollTop - (event.clientY - drawerStartY);
    event.preventDefault();
  });

  function stopDrawerDragging(event) {
    if (!isDrawerDragging) {
      return;
    }

    isDrawerDragging = false;
    drawerContent.classList.remove("dragging");

    if (drawerContent.hasPointerCapture(event.pointerId)) {
      drawerContent.releasePointerCapture(event.pointerId);
    }
  }

  drawerContent.addEventListener("pointerup", stopDrawerDragging);
  drawerContent.addEventListener("pointercancel", stopDrawerDragging);
  drawerContent.addEventListener("lostpointercapture", () => {
    isDrawerDragging = false;
    drawerContent.classList.remove("dragging");
  });

  imageRows.forEach((row) => {
    let isDragging = false;
    let startX = 0;
    let startY = 0;
    let startScrollLeft = 0;
    let startScrollTop = 0;
    let dragMode = null;

    row.addEventListener("pointerdown", (event) => {
      isDragging = true;
      startX = event.clientX;
      startY = event.clientY;
      startScrollLeft = row.scrollLeft;
      startScrollTop = drawerContent.scrollTop;
      dragMode = null;
      row.classList.add("dragging");
      row.setPointerCapture(event.pointerId);
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
      } else {
        drawerContent.scrollTop = startScrollTop - distanceY;
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
    });
  });
};
