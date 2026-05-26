(function initSiteLoader() {
  const loader = document.querySelector("[data-site-loader]");

  if (!loader) {
    return;
  }

  const progressBar = loader.querySelector("[data-site-loader-bar]");
  const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches;
  const startTime = performance.now();
  const minVisibleMs = prefersReducedMotion ? 120 : 900;
  const fallbackReadyMs = prefersReducedMotion ? 1200 : 12000;

  let progress = 0;
  let isPageReady = document.readyState === "complete";
  let isFinished = false;
  let rafId = 0;

  function setProgress(value) {
    progress = Math.max(progress, Math.min(100, value));
    loader.style.setProperty("--site-loader-progress", `${progress.toFixed(2)}%`);
    progressBar?.setAttribute("aria-valuenow", String(Math.round(progress)));
  }

  function finish() {
    if (isFinished) {
      return;
    }

    isFinished = true;
    setProgress(100);

    window.setTimeout(() => {
      loader.classList.add("is-complete");
    }, prefersReducedMotion ? 20 : 180);

    window.setTimeout(() => {
      loader.remove();
    }, prefersReducedMotion ? 80 : 620);
  }

  function markPageReady() {
    isPageReady = true;
  }

  function tick(now) {
    const elapsed = now - startTime;

    if (elapsed >= fallbackReadyMs) {
      markPageReady();
    }

    if (isPageReady && elapsed >= minVisibleMs) {
      setProgress(progress + (100 - progress) * 0.34);

      if (progress >= 99.4) {
        finish();
        return;
      }
    } else {
      const loadingTarget = Math.min(92, 18 + (1 - Math.exp(-elapsed / 780)) * 76);
      setProgress(progress + (loadingTarget - progress) * 0.12);
    }

    rafId = window.requestAnimationFrame(tick);
  }

  window.addEventListener("load", markPageReady, { once: true });

  if (isPageReady) {
    window.setTimeout(markPageReady, 0);
  }

  setProgress(4);
  rafId = window.requestAnimationFrame(tick);

  window.addEventListener("pagehide", () => {
    if (rafId) {
      window.cancelAnimationFrame(rafId);
    }
  }, { once: true });
})();
