window.CBO = window.CBO || {};

window.CBO.initColorDrop = function initColorDrop() {
  const button = document.querySelector(".color-picker-button");
  const swatch = document.querySelector(".color-picker-swatch");

  if (!button || !swatch || button.dataset.colorDropReady === "true") {
    return;
  }

  button.dataset.colorDropReady = "true";

  const dragThreshold = 7;
  const blobs = [
    { name: "main", ease: 0.28, x: 0, y: 0, previousX: 0, previousY: 0, element: null },
    { name: "trail-a", ease: 0.17, x: 0, y: 0, previousX: 0, previousY: 0, element: null },
    { name: "trail-b", ease: 0.1, x: 0, y: 0, previousX: 0, previousY: 0, element: null },
  ];
  let pointerId = null;
  let startX = 0;
  let startY = 0;
  let targetX = 0;
  let targetY = 0;
  let ghost = null;
  let animationFrame = null;
  let isDragging = false;
  let suppressNextClick = false;

  function ensureGooFilter() {
    if (document.getElementById("color-drop-goo")) {
      return;
    }

    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");

    svg.classList.add("color-drop-filter");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = `
      <defs>
        <filter id="color-drop-goo" color-interpolation-filters="sRGB">
          <feGaussianBlur in="SourceGraphic" stdDeviation="7" result="blur" />
          <feColorMatrix in="blur" mode="matrix" values="
            1 0 0 0 0
            0 1 0 0 0
            0 0 1 0 0
            0 0 0 18 -8
          " result="goo" />
          <feComposite in="SourceGraphic" in2="goo" operator="atop" />
        </filter>
      </defs>
    `;
    document.body.appendChild(svg);
  }

  function getActiveColor() {
    return window.CBO.selectedColor || "#FFFFFF";
  }

  function getSwatchCenter() {
    const rect = swatch.getBoundingClientRect();

    return {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  }

  function setBlobTransform(blob, opacity = 1) {
    if (!blob.element) {
      return;
    }

    const velocityX = blob.x - blob.previousX;
    const velocityY = blob.y - blob.previousY;
    const speed = Math.min(Math.hypot(velocityX, velocityY), 44);
    const stretch = 1 + speed * 0.006;
    const squeeze = 1 - speed * 0.003;
    const rotation = Math.atan2(velocityY, velocityX);

    blob.element.style.opacity = opacity;
    blob.element.style.transform = `translate3d(${blob.x}px, ${blob.y}px, 0) translate(-50%, -50%) rotate(${rotation}rad) scale(${stretch}, ${squeeze})`;
    blob.previousX = blob.x;
    blob.previousY = blob.y;
  }

  function animateGhost() {
    if (!ghost) {
      return;
    }

    blobs.forEach((blob) => {
      blob.x += (targetX - blob.x) * blob.ease;
      blob.y += (targetY - blob.y) * blob.ease;
      setBlobTransform(blob);
    });

    animationFrame = window.requestAnimationFrame(animateGhost);
  }

  function startGhost() {
    const center = getSwatchCenter();
    const popover = document.querySelector(".color-picker-popover");

    if (popover && !popover.hidden) {
      popover.hidden = true;
      button.classList.remove("open");
      button.setAttribute("aria-expanded", "false");
    }

    ensureGooFilter();
    targetX = center.x;
    targetY = center.y;

    ghost = document.createElement("div");
    ghost.className = "color-drop-ghost";
    ghost.style.setProperty("--color-drop-color", getActiveColor());

    blobs.forEach((blob) => {
      blob.x = center.x;
      blob.y = center.y;
      blob.previousX = center.x;
      blob.previousY = center.y;
      blob.element = document.createElement("div");
      blob.element.className = `color-drop-blob color-drop-blob-${blob.name}`;
      ghost.appendChild(blob.element);
      setBlobTransform(blob, 0.92);
    });

    document.body.appendChild(ghost);

    window.requestAnimationFrame(() => {
      blobs.forEach((blob) => setBlobTransform(blob));
      animationFrame = window.requestAnimationFrame(animateGhost);
    });
  }

  function finishGhost(clientX, clientY) {
    const color = getActiveColor();
    const ripple = document.createElement("div");

    ripple.className = "color-drop-ripple";
    ripple.style.setProperty("--color-drop-color", color);
    ripple.style.setProperty("--drop-x", `${clientX}px`);
    ripple.style.setProperty("--drop-y", `${clientY}px`);
    document.body.appendChild(ripple);
    ripple.addEventListener("animationend", () => ripple.remove(), { once: true });

    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    if (ghost) {
      const converge = (blob, index) => {
        if (!blob.element) {
          return;
        }

        blob.element.style.transition = `opacity 150ms ease, transform ${150 + index * 35}ms ease`;
        blob.element.style.transform = `translate3d(${clientX}px, ${clientY}px, 0) translate(-50%, -50%) scale(${1.2 - index * 0.12})`;
        blob.element.style.opacity = "0";
      };

      blobs.forEach(converge);
      window.setTimeout(() => {
        ghost?.remove();
        ghost = null;
        blobs.forEach((blob) => {
          blob.element = null;
        });
      }, 240);
    }
  }

  function cancelGhost() {
    if (animationFrame) {
      window.cancelAnimationFrame(animationFrame);
      animationFrame = null;
    }

    ghost?.remove();
    ghost = null;
    blobs.forEach((blob) => {
      blob.element = null;
    });
  }

  button.addEventListener("pointerdown", (event) => {
    if (event.button !== 0 || event.target.closest(".color-picker-popover")) {
      return;
    }

    pointerId = event.pointerId;
    startX = event.clientX;
    startY = event.clientY;
    targetX = event.clientX;
    targetY = event.clientY;
    isDragging = false;
    suppressNextClick = false;
    button.setPointerCapture(pointerId);
  });

  button.addEventListener("pointermove", (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    const deltaX = event.clientX - startX;
    const deltaY = event.clientY - startY;

    if (!isDragging && Math.hypot(deltaX, deltaY) >= dragThreshold) {
      isDragging = true;
      suppressNextClick = true;
      button.classList.remove("tooltip-visible");
      startGhost();
    }

    if (!isDragging) {
      return;
    }

    event.preventDefault();
    targetX = event.clientX;
    targetY = event.clientY;
  });

  button.addEventListener("pointerup", (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    button.releasePointerCapture(pointerId);
    pointerId = null;

    if (isDragging) {
      event.preventDefault();
      finishGhost(event.clientX, event.clientY);
    }

    isDragging = false;
  });

  button.addEventListener("pointercancel", (event) => {
    if (event.pointerId !== pointerId) {
      return;
    }

    pointerId = null;
    isDragging = false;
    suppressNextClick = false;
    cancelGhost();
  });

  button.addEventListener(
    "click",
    (event) => {
      if (!suppressNextClick) {
        return;
      }

      event.preventDefault();
      event.stopImmediatePropagation();
      suppressNextClick = false;
    },
    true,
  );
};
