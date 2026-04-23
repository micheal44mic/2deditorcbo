window.CBO = window.CBO || {};

window.CBO.initBrushesPanel = function initBrushesPanel() {
  const panel = document.querySelector(".right-panel");
  const content = panel?.querySelector(".right-sidebar-content");

  if (!panel || !content || panel.dataset.brushesPanelReady === "true") {
    return;
  }

  panel.dataset.brushesPanelReady = "true";
  content.insertAdjacentHTML(
    "beforeend",
    `
      <section class="brushes-panel right-sidebar-section" data-brush-gallery hidden>
        <div class="brushes-panel-header">
          <h2>CBOs Brushes</h2>
          <div class="brushes-panel-actions">
            <button class="brushes-panel-header-button brushes-panel-gallery-button" type="button" aria-label="BRUSH GALLERY" aria-controls="brushes-gallery-popout" aria-expanded="false" data-tooltip="BRUSH GALLERY">
              <svg class="brushes-panel-icon lucide lucide-library-big-icon lucide-library-big" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <rect width="8" height="18" x="3" y="3" rx="1" />
                <path d="M7 3v18" />
                <path d="M20.4 18.9c.2.5-.1 1.1-.6 1.3l-1.9.7c-.5.2-1.1-.1-1.3-.6L11.1 5.1c-.2-.5.1-1.1.6-1.3l1.9-.7c.5-.2 1.1.1 1.3.6Z" />
              </svg>
            </button>
            <button class="brushes-panel-header-button brushes-panel-studio-button" type="button" aria-label="BRUSH STUDIO" data-tooltip="BRUSH STUDIO">
              <svg class="brushes-panel-icon lucide lucide-notebook-pen-icon lucide-notebook-pen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" />
                <path d="M2 6h4" />
                <path d="M2 10h4" />
                <path d="M2 14h4" />
                <path d="M2 18h4" />
                <path d="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />
              </svg>
            </button>
          </div>
        </div>
        <div class="brushes-panel-grid" aria-label="Brush gallery">
          <button class="brushes-panel-card active" type="button" aria-label="Soft brush" aria-pressed="true">
            <span class="brushes-panel-card-name">SOFT</span>
          </button>
          <button class="brushes-panel-card" type="button" aria-label="Ink brush" aria-pressed="false">
            <span class="brushes-panel-card-name">INK</span>
          </button>
          <button class="brushes-panel-card" type="button" aria-label="Flat brush" aria-pressed="false">
            <span class="brushes-panel-card-name">FLAT</span>
          </button>
          <button class="brushes-panel-card" type="button" aria-label="Grain brush" aria-pressed="false">
            <span class="brushes-panel-card-name">GRAIN</span>
          </button>
          <button class="brushes-panel-see-more" type="button" aria-controls="brushes-gallery-popout" aria-expanded="false">SEE MORE</button>
        </div>
      </section>
    `,
  );

  panel.insertAdjacentHTML(
    "beforeend",
    `
      <aside class="brushes-gallery-popout" id="brushes-gallery-popout" aria-label="Brush gallery panel" data-brush-popout hidden>
        <h2>BRUSH GALLERY</h2>
      </aside>
    `,
  );

  const brushGallery = panel.querySelector("[data-brush-gallery]");
  const brushPopout = panel.querySelector("[data-brush-popout]");
  const brushPopoutButtons = panel.querySelectorAll(
    ".brushes-panel-gallery-button, .brushes-panel-see-more",
  );
  const brushCards = panel.querySelectorAll(".brushes-panel-card");

  function closeBrushPopout() {
    if (!brushPopout) {
      return;
    }

    brushPopout.hidden = true;
    brushPopoutButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "false");
    });
  }

  function openBrushPopout() {
    if (!brushPopout) {
      return;
    }

    brushPopout.hidden = false;
    brushPopoutButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "true");
    });
  }

  brushCards.forEach((brushCard) => {
    brushCard.addEventListener("click", () => {
      brushCards.forEach((card) => {
        const isActive = card === brushCard;

        card.classList.toggle("active", isActive);
        card.setAttribute("aria-pressed", String(isActive));
      });
    });
  });

  brushPopoutButtons.forEach((button) => {
    button.addEventListener("click", openBrushPopout);
  });

  window.addEventListener("cbo:tool-change", (event) => {
    const isBrushTool =
      event.detail?.syncGroup === "brush" || event.detail?.label?.toUpperCase() === "BRUSH";

    if (brushGallery) {
      brushGallery.hidden = !isBrushTool;
    }

    if (!isBrushTool) {
      closeBrushPopout();
    }
  });
};
