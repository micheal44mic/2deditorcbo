window.CBO = window.CBO || {};

window.CBO.initBrushesPanel = function initBrushesPanel() {
  // Temporary demo data. Replace this array with the real brush packages later:
  // each package controls the popout list and the sidebar brushes shown after selection.
  const brushPackages = [
    {
      name: "ESSENTIAL PACK",
      brushes: ["SOFT", "INK"],
    },
    {
      name: "SKETCH PACK",
      brushes: ["PENCIL", "MARKER"],
    },
  ];
  const editorPage = document.querySelector(".editor-page");
  const panel = document.querySelector(".right-panel");
  const content = panel?.querySelector(".right-sidebar-content");

  if (!editorPage || !panel || !content || panel.dataset.brushesPanelReady === "true") {
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
        <div class="brushes-panel-grid" aria-label="Brush gallery" data-sidebar-brush-list>
        </div>
        <button class="brushes-panel-see-more" type="button" aria-controls="brushes-gallery-popout" aria-expanded="false">SEE MORE</button>
      </section>
    `,
  );

  editorPage.insertAdjacentHTML(
    "beforeend",
    `
      <aside class="brushes-gallery-popout" id="brushes-gallery-popout" aria-label="Brush gallery panel" data-brush-popout hidden>
        <div class="brushes-gallery-popout-header">
          <div class="brushes-gallery-popout-title">
            <h2>BRUSH GALLERY</h2>
          </div>
          <div class="brushes-gallery-popout-actions">
            <button class="brushes-gallery-studio-button" type="button">BRUSH STUDIO</button>
            <button class="brushes-gallery-close-button" type="button" aria-label="Close brush gallery" data-brush-popout-close>
              <svg class="brushes-gallery-close-icon lucide lucide-x-icon lucide-x" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                <path d="M18 6 6 18" />
                <path d="m6 6 12 12" />
              </svg>
            </button>
          </div>
        </div>
        <div class="brushes-gallery-layout">
          <div class="brushes-gallery-packages" aria-label="Brush packages" data-brush-packages></div>
          <div class="brushes-gallery-brushes" aria-label="Brushes" data-brush-package-items></div>
        </div>
      </aside>
    `,
  );

  const brushGallery = panel.querySelector("[data-brush-gallery]");
  const brushPopout = editorPage.querySelector("[data-brush-popout]");
  const brushPopoutButtons = panel.querySelectorAll(
    ".brushes-panel-gallery-button, .brushes-panel-see-more",
  );
  const sidebarBrushList = panel.querySelector("[data-sidebar-brush-list]");
  const packageList = brushPopout?.querySelector("[data-brush-packages]");
  const packageItems = brushPopout?.querySelector("[data-brush-package-items]");
  const closeButton = brushPopout?.querySelector("[data-brush-popout-close]");
  let activePackageIndex = 0;
  let selectedPackageIndex = 0;
  let selectedBrushName = brushPackages[selectedPackageIndex].brushes[0];

  // Sidebar shows the brushes from the selected package. SEE MORE stays outside this
  // scrollable list, so it remains visible while only the brush cards scroll.
  function renderSidebarBrushes() {
    if (!sidebarBrushList) {
      return;
    }

    const selectedPackage = brushPackages[selectedPackageIndex];

    sidebarBrushList.replaceChildren(
      ...selectedPackage.brushes.map((brushName) => {
        const brushButton = document.createElement("button");
        const brushNameLabel = document.createElement("span");
        const isActive = brushName === selectedBrushName;

        brushButton.className = "brushes-panel-card";
        brushButton.type = "button";
        brushButton.setAttribute("aria-label", `${brushName} brush`);
        brushButton.setAttribute("aria-pressed", String(isActive));
        brushButton.classList.toggle("active", isActive);
        brushNameLabel.className = "brushes-panel-card-name";
        brushNameLabel.textContent = brushName;
        brushButton.append(brushNameLabel);
        brushButton.addEventListener("click", () => {
          selectedBrushName = brushName;
          renderSidebarBrushes();
        });

        return brushButton;
      }),
    );

    sidebarBrushList.querySelector(".brushes-panel-card.active")?.scrollIntoView({
      block: "nearest",
    });
  }

  // Popout right column changes when a package is selected on the left.
  // Selecting a brush commits that package to the sidebar and closes the popout.
  function renderPackageItems() {
    if (!packageItems) {
      return;
    }

    const activePackage = brushPackages[activePackageIndex];

    packageItems.replaceChildren(
      ...activePackage.brushes.map((brushName) => {
        const brushButton = document.createElement("button");
        const brushNameLabel = document.createElement("span");

        brushButton.className = "brushes-gallery-brush";
        brushButton.type = "button";
        brushNameLabel.className = "brushes-gallery-item-name";
        brushNameLabel.textContent = brushName;
        brushButton.append(brushNameLabel);
        brushButton.addEventListener("click", () => {
          selectedPackageIndex = activePackageIndex;
          selectedBrushName = brushName;
          renderSidebarBrushes();
          closeBrushPopout();
        });

        return brushButton;
      }),
    );
  }

  function setActivePackage(packageIndex) {
    activePackageIndex = packageIndex;

    packageList?.querySelectorAll(".brushes-gallery-package").forEach((button, index) => {
      const isActive = index === activePackageIndex;

      button.classList.toggle("active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });

    renderPackageItems();
  }

  if (packageList) {
    packageList.replaceChildren(
      ...brushPackages.map((brushPackage, packageIndex) => {
        const packageButton = document.createElement("button");

        packageButton.className = "brushes-gallery-package";
        packageButton.type = "button";
        packageButton.textContent = brushPackage.name;
        packageButton.setAttribute("aria-pressed", String(packageIndex === activePackageIndex));
        packageButton.classList.toggle("active", packageIndex === activePackageIndex);
        packageButton.addEventListener("click", () => {
          setActivePackage(packageIndex);
        });

        return packageButton;
      }),
    );
  }

  renderPackageItems();
  renderSidebarBrushes();

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

    setActivePackage(selectedPackageIndex);
    brushPopout.hidden = false;
    brushPopoutButtons.forEach((button) => {
      button.setAttribute("aria-expanded", "true");
    });
  }

  brushPopoutButtons.forEach((button) => {
    button.addEventListener("click", openBrushPopout);
  });

  closeButton?.addEventListener("click", closeBrushPopout);

  document.addEventListener("click", (event) => {
    if (!brushPopout || brushPopout.hidden) {
      return;
    }

    const target = event.target;
    const clickedInsidePopout = target instanceof Element && brushPopout.contains(target);
    const clickedOpenButton =
      target instanceof Element && Array.from(brushPopoutButtons).some((button) => button.contains(target));

    if (!clickedInsidePopout && !clickedOpenButton) {
      closeBrushPopout();
    }
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
