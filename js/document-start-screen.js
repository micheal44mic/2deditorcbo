(function initDocumentStartScreenModule(namespace) {
  const FALLBACK_DOCUMENT_PRESET = Object.freeze({
    height: 4000,
    id: "square-4000",
    label: "4000 x 4000",
    tag: "CURRENT",
    width: 4000,
  });

  function getDocumentPresets() {
    return Array.isArray(namespace.editorDocumentPresets)
      ? namespace.editorDocumentPresets
      : [];
  }

  function getDefaultDocumentPresetId() {
    return namespace.getDefaultEditorDocumentPresetId?.() ||
      namespace.defaultDocumentPresetId ||
      FALLBACK_DOCUMENT_PRESET.id;
  }

  function getDocumentPreset(id) {
    return namespace.getEditorDocumentPreset?.(id) ||
      getDocumentPresets().find((preset) => preset?.id === id) ||
      getDocumentPresets()[0] ||
      FALLBACK_DOCUMENT_PRESET;
  }

  function createDocumentPresetButton(preset) {
    const button = document.createElement("button");
    const preview = document.createElement("span");
    const label = document.createElement("span");
    const tag = document.createElement("span");

    button.className = "document-start-preset";
    button.type = "button";
    button.dataset.documentPreset = preset.id;
    button.setAttribute("aria-label", `Create ${preset.label} document`);

    preview.className = "document-start-preset-preview";
    preview.style.setProperty("--document-preset-aspect", `${preset.width} / ${preset.height}`);

    label.className = "document-start-preset-label";
    label.textContent = preset.label;

    tag.className = "document-start-preset-tag";
    tag.textContent = preset.tag;

    button.append(preview, label, tag);
    return button;
  }

  function formatDocumentSaveDate(value) {
    const date = new Date(value);

    if (Number.isNaN(date.getTime())) {
      return "";
    }

    return date.toLocaleString([], {
      dateStyle: "short",
      timeStyle: "short",
    });
  }

  function createDocumentRecoveryButton(summary) {
    const button = document.createElement("button");
    const label = document.createElement("span");
    const meta = document.createElement("span");
    const projectName = String(summary?.projectName || "").trim();
    const savedAt = formatDocumentSaveDate(summary?.savedAt);
    const sizeLabel = `${Math.max(1, Math.round(summary?.width || 1))} x ${Math.max(1, Math.round(summary?.height || 1))}`;
    const layerLabel = `${Math.max(0, Math.round(summary?.layerCount || 0))} layers`;
    const tileLabel = `${Math.max(0, Math.round(summary?.tileCount || 0))} tiles`;

    button.className = "document-start-recovery";
    button.type = "button";
    button.dataset.documentRecovery = summary?.sessionId || "";
    button.setAttribute("aria-label", projectName ? `Open saved project ${projectName}` : "Open saved project");

    label.className = "document-start-recovery-label";
    label.textContent = projectName || "Untitled project";

    meta.className = "document-start-recovery-meta";
    meta.textContent = [sizeLabel, layerLabel, tileLabel, savedAt].filter(Boolean).join(" | ");

    button.append(label, meta);
    return button;
  }

  function getProjectThumbnailSrc(summary) {
    const src = String(summary?.thumbnailDataUrl || "").trim();

    return src.startsWith("data:image/") ? src : "";
  }

  function createProjectFallbackPreview(summary) {
    const fallback = document.createElement("span");
    const projectName = String(summary?.projectName || "").trim();
    const label = projectName || "Untitled";

    fallback.className = "document-start-project-preview-fallback";
    fallback.textContent = label.slice(0, 1).toUpperCase();
    fallback.setAttribute("aria-hidden", "true");

    return fallback;
  }

  function createSavedProjectCard(summary) {
    const card = document.createElement("div");
    const openButton = document.createElement("button");
    const preview = document.createElement("div");
    const thumbnailSrc = getProjectThumbnailSrc(summary);
    const title = document.createElement("span");
    const meta = document.createElement("span");
    const deleteButton = document.createElement("button");
    const projectName = String(summary?.projectName || "").trim();
    const savedAt = formatDocumentSaveDate(summary?.savedAt);
    const sizeLabel = `${Math.max(1, Math.round(summary?.width || 1))} x ${Math.max(1, Math.round(summary?.height || 1))}`;

    card.className = "document-start-project-card document-start-project-card-saved";
    card.dataset.documentProjectSaved = summary?.sessionId || "";

    openButton.className = "document-start-project-open";
    openButton.type = "button";
    openButton.dataset.documentRecovery = summary?.sessionId || "";
    openButton.setAttribute("aria-label", projectName ? `Open saved project ${projectName}` : "Open saved project");

    preview.className = "document-start-project-preview document-start-project-preview-saved";

    if (thumbnailSrc) {
      const image = document.createElement("img");

      image.className = "document-start-project-thumbnail";
      image.src = thumbnailSrc;
      image.alt = "";
      image.decoding = "async";
      image.loading = "lazy";
      preview.append(image);
    } else {
      preview.append(createProjectFallbackPreview(summary));
    }

    title.className = "document-start-project-card-title";
    title.textContent = projectName || "Untitled project";

    meta.className = "document-start-project-card-meta";
    meta.textContent = [sizeLabel, savedAt].filter(Boolean).join(" | ");

    deleteButton.className = "document-start-project-delete";
    deleteButton.type = "button";
    deleteButton.dataset.documentDelete = summary?.sessionId || "";
    deleteButton.textContent = "DELETE";
    deleteButton.setAttribute("aria-label", `Delete saved project ${projectName || "Untitled project"}`);

    openButton.append(preview, title, meta);
    card.append(openButton, deleteButton);

    return {
      card,
      deleteButton,
      openButton,
    };
  }

  function createDocumentRecoveryItem(summary) {
    const item = document.createElement("div");
    const openButton = createDocumentRecoveryButton(summary);
    const deleteButton = document.createElement("button");
    const projectName = String(summary?.projectName || "").trim() || "Untitled project";

    item.className = "document-start-recovery-item";
    item.dataset.documentSessionId = summary?.sessionId || "";

    deleteButton.className = "document-start-recovery-delete";
    deleteButton.type = "button";
    deleteButton.dataset.documentDelete = summary?.sessionId || "";
    deleteButton.textContent = "DELETE";
    deleteButton.setAttribute("aria-label", `Delete saved project ${projectName}`);

    item.append(openButton, deleteButton);

    return {
      deleteButton,
      item,
      openButton,
    };
  }

  function createDocumentRecoverySection() {
    const section = document.createElement("section");
    const title = document.createElement("h2");
    const list = document.createElement("div");

    section.className = "document-start-recovery-section";
    section.setAttribute("aria-labelledby", "document-start-recovery-title");

    title.className = "document-start-section-title";
    title.id = "document-start-recovery-title";
    title.textContent = "Saved projects";

    list.className = "document-start-recovery-list";
    list.dataset.documentRecoveryList = "";

    section.append(title, list);

    return {
      list,
      section,
    };
  }

  function createDocumentStartSidebar() {
    const brand = document.createElement("h1");
    const newProjectButton = document.createElement("button");
    const newProjectLabel = document.createElement("span");
    const allProjectsButton = document.createElement("button");
    const allProjectsLabel = document.createElement("span");
    const templateButton = document.createElement("button");
    const templateLabel = document.createElement("span");
    const aiArchiveButton = document.createElement("button");
    const aiArchiveLabel = document.createElement("span");

    brand.className = "document-start-brand";
    brand.textContent = "M1M4.COM";

    newProjectButton.className = "document-start-new-project";
    newProjectButton.type = "button";
    newProjectButton.dataset.documentNewProject = "";
    newProjectButton.setAttribute("aria-label", "New Project");
    newProjectButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <path d="M5 12h14" />',
      '  <path d="M12 5v14" />',
      '</svg>',
    ].join("");

    newProjectLabel.className = "document-start-menu-item-label";
    newProjectLabel.textContent = "New Project";

    newProjectButton.append(newProjectLabel);

    allProjectsButton.className = "document-start-all-projects";
    allProjectsButton.type = "button";
    allProjectsButton.dataset.documentAllProjects = "";
    allProjectsButton.setAttribute("aria-label", "All Project");
    allProjectsButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-dot-icon lucide-folder-dot" aria-hidden="true">',
      '  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />',
      '  <circle cx="12" cy="13" r="1" />',
      '</svg>',
    ].join("");

    allProjectsLabel.className = "document-start-menu-item-label";
    allProjectsLabel.textContent = "All Project";

    allProjectsButton.append(allProjectsLabel);

    templateButton.className = "document-start-template";
    templateButton.type = "button";
    templateButton.dataset.documentTemplate = "";
    templateButton.setAttribute("aria-label", "Template");
    templateButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <rect width="18" height="7" x="3" y="3" rx="1" />',
      '  <rect width="9" height="7" x="3" y="14" rx="1" />',
      '  <rect width="5" height="7" x="16" y="14" rx="1" />',
      '</svg>',
    ].join("");

    templateLabel.className = "document-start-menu-item-label";
    templateLabel.textContent = "Template";

    templateButton.append(templateLabel);

    aiArchiveButton.className = "document-start-ai-archive";
    aiArchiveButton.type = "button";
    aiArchiveButton.dataset.documentAiArchive = "";
    aiArchiveButton.setAttribute("aria-label", "AI Archive");
    aiArchiveButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package-open-icon lucide-package-open" aria-hidden="true">',
      '  <path d="M12 22v-9" />',
      '  <path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z" />',
      '  <path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13" />',
      '  <path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z" />',
      '</svg>',
    ].join("");

    aiArchiveLabel.className = "document-start-menu-item-label";
    aiArchiveLabel.textContent = "AI Archive";

    aiArchiveButton.append(aiArchiveLabel);

    return {
      aiArchiveButton,
      allProjectsButton,
      brand,
      newProjectButton,
      templateButton,
    };
  }

  function createDocumentStartOverview() {
    const container = document.createElement("section");
    const copy = document.createElement("div");
    const title = document.createElement("h2");
    const subtitle = document.createElement("p");
    const commandBar = document.createElement("div");
    const tabs = document.createElement("div");
    const actions = document.createElement("div");
    const allProjectsTab = document.createElement("button");
    const templateTab = document.createElement("button");
    const aiArchiveTab = document.createElement("button");
    const newProjectButton = document.createElement("button");
    const searchButton = document.createElement("button");

    container.className = "document-start-overview";
    container.setAttribute("aria-label", "Project overview");

    copy.className = "document-start-overview-copy";

    title.className = "document-start-overview-title";
    title.textContent = "All Project";

    subtitle.className = "document-start-overview-subtitle";
    subtitle.textContent = "Create, open and organize your projects.";

    copy.append(title, subtitle);

    commandBar.className = "document-start-overview-command-bar";
    tabs.className = "document-start-overview-tabs";
    actions.className = "document-start-overview-actions";

    allProjectsTab.className = "document-start-overview-tab is-active";
    allProjectsTab.type = "button";
    allProjectsTab.dataset.documentOverviewAllProjects = "";
    allProjectsTab.setAttribute("aria-label", "All Project");
    allProjectsTab.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-folder-dot-icon lucide-folder-dot" aria-hidden="true">',
      '  <path d="M4 20h16a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.93a2 2 0 0 1-1.66-.9l-.82-1.2A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13c0 1.1.9 2 2 2Z" />',
      '  <circle cx="12" cy="13" r="1" />',
      '</svg>',
      '<span>All Project</span>',
    ].join("");

    templateTab.className = "document-start-overview-tab";
    templateTab.type = "button";
    templateTab.dataset.documentOverviewTemplate = "";
    templateTab.setAttribute("aria-label", "Template");
    templateTab.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <rect width="18" height="7" x="3" y="3" rx="1" />',
      '  <rect width="9" height="7" x="3" y="14" rx="1" />',
      '  <rect width="5" height="7" x="16" y="14" rx="1" />',
      '</svg>',
      '<span>Template</span>',
    ].join("");

    aiArchiveTab.className = "document-start-overview-tab";
    aiArchiveTab.type = "button";
    aiArchiveTab.dataset.documentOverviewAiArchive = "";
    aiArchiveTab.setAttribute("aria-label", "AI Archive");
    aiArchiveTab.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" class="lucide lucide-package-open-icon lucide-package-open" aria-hidden="true">',
      '  <path d="M12 22v-9" />',
      '  <path d="M15.17 2.21a1.67 1.67 0 0 1 1.63 0L21 4.57a1.93 1.93 0 0 1 0 3.36L8.82 14.79a1.655 1.655 0 0 1-1.64 0L3 12.43a1.93 1.93 0 0 1 0-3.36z" />',
      '  <path d="M20 13v3.87a2.06 2.06 0 0 1-1.11 1.83l-6 3.08a1.93 1.93 0 0 1-1.78 0l-6-3.08A2.06 2.06 0 0 1 4 16.87V13" />',
      '  <path d="M21 12.43a1.93 1.93 0 0 0 0-3.36L8.83 2.2a1.64 1.64 0 0 0-1.63 0L3 4.57a1.93 1.93 0 0 0 0 3.36l12.18 6.86a1.636 1.636 0 0 0 1.63 0z" />',
      '</svg>',
      '<span>AI Archive</span>',
    ].join("");

    newProjectButton.className = "document-start-overview-new-project";
    newProjectButton.type = "button";
    newProjectButton.dataset.documentOverviewNewProject = "";
    newProjectButton.setAttribute("aria-label", "New Project");
    newProjectButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <path d="M5 12h14" />',
      '  <path d="M12 5v14" />',
      '</svg>',
      '<span>New Project</span>',
    ].join("");

    searchButton.className = "document-start-overview-icon-button";
    searchButton.type = "button";
    searchButton.dataset.documentOverviewSearch = "";
    searchButton.setAttribute("aria-label", "Search");
    searchButton.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <circle cx="11" cy="11" r="8" />',
      '  <path d="m21 21-4.3-4.3" />',
      '</svg>',
    ].join("");

    tabs.append(allProjectsTab, templateTab, aiArchiveTab);
    actions.append(newProjectButton, searchButton);
    commandBar.append(tabs, actions);
    container.append(copy, commandBar);

    return {
      container,
      newProjectButton,
    };
  }

  function createDocumentStartProjects() {
    const section = document.createElement("section");
    const grid = document.createElement("div");
    const createCard = document.createElement("button");
    const createPreview = document.createElement("div");
    const createIcon = document.createElement("span");
    const createTitle = document.createElement("span");

    section.className = "document-start-projects";
    section.setAttribute("aria-label", "Projects");

    grid.className = "document-start-project-grid";

    createCard.className = "document-start-project-card document-start-project-card-create";
    createCard.type = "button";
    createCard.dataset.documentProjectCreate = "";
    createCard.setAttribute("aria-label", "Create new canvas");

    createPreview.className = "document-start-project-preview document-start-project-preview-create";
    createIcon.className = "document-start-project-create-icon";
    createIcon.innerHTML = [
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">',
      '  <path d="M5 12h14" />',
      '  <path d="M12 5v14" />',
      '</svg>',
    ].join("");

    createTitle.className = "document-start-project-card-title";
    createTitle.textContent = "Create new canvas";

    createPreview.append(createIcon);
    createCard.append(createPreview, createTitle);

    grid.append(createCard);
    section.append(grid);

    return {
      createCard,
      grid,
      section,
    };
  }

  function startDocumentFromPreset(preset, source = "document-start-new") {
    namespace.documentSaveSystem?.clearCurrentDocument?.();
    namespace.setDocumentProjectName?.("", { source });

    namespace.initEditorCanvas?.({
      documentHeight: preset.height,
      documentWidth: preset.width,
      presetId: preset.id,
      startWithNoActiveLayer: true,
    });
  }

  function clearSavedProjectCards(grid) {
    grid.querySelectorAll("[data-document-project-saved]").forEach((card) => card.remove());
  }

  function renderSavedProjects(stage, projects, saveSystem) {
    void saveSystem.listSummaries().then((summaries) => {
      if (stage.dataset.canvasReady === "true") {
        return;
      }

      const grid = projects?.grid;

      if (!grid) {
        return;
      }

      clearSavedProjectCards(grid);

      if (!Array.isArray(summaries) || summaries.length === 0) {
        return;
      }

      summaries.forEach((summary) => {
        const sessionId = String(summary?.sessionId || "").trim();
        const projectCard = createSavedProjectCard(summary);

        projectCard.openButton.addEventListener("click", () => {
          if (!sessionId) {
            return;
          }

          projectCard.openButton.disabled = true;
          projectCard.openButton.dataset.loading = "true";
          void saveSystem.restore(sessionId).then((didRestore) => {
            if (didRestore) {
              return;
            }

            projectCard.openButton.disabled = false;
            projectCard.openButton.dataset.loading = "false";
          }).catch((error) => {
            console.warn("Impossibile ripristinare il documento salvato.", error);
            projectCard.openButton.disabled = false;
            projectCard.openButton.dataset.loading = "false";
          });
        });

        projectCard.deleteButton.addEventListener("click", () => {
          if (!sessionId) {
            return;
          }

          const projectName = String(summary?.projectName || "").trim() || "Untitled project";

          if (typeof window.confirm === "function" && !window.confirm(`Delete saved project "${projectName}"?`)) {
            return;
          }

          projectCard.deleteButton.disabled = true;
          void saveSystem.delete?.(sessionId).then(() => {
            renderSavedProjects(stage, projects, saveSystem);
          }).catch((error) => {
            console.warn("Impossibile eliminare il documento salvato.", error);
            projectCard.deleteButton.disabled = false;
          });
        });

        grid.append(projectCard.card);
      });
    });
  }

  function renderLatestRecoverableProject(stage, recoveryHost, saveSystem) {
    void saveSystem.getLatestSummary().then((summary) => {
      if (!summary || stage.dataset.canvasReady === "true") {
        return;
      }

      const recoveryButton = createDocumentRecoveryButton(summary);

      recoveryButton.addEventListener("click", () => {
        recoveryButton.disabled = true;
        recoveryButton.dataset.loading = "true";
        void saveSystem.restoreLatest().then((didRestore) => {
          if (didRestore) {
            return;
          }

          recoveryButton.disabled = false;
          recoveryButton.dataset.loading = "false";
        }).catch((error) => {
          console.warn("Impossibile ripristinare il documento salvato.", error);
          recoveryButton.disabled = false;
          recoveryButton.dataset.loading = "false";
        });
      });

      recoveryHost.replaceChildren(recoveryButton);
      recoveryHost.hidden = false;
    });
  }

  namespace.initEditorDocumentStart = function initEditorDocumentStart() {
    const stage = document.querySelector(".editor-stage");
    const editorPage = stage?.closest?.(".editor-page");

    if (!stage || stage.dataset.canvasReady === "true") {
      return null;
    }

    if (stage.dataset.documentStartReady === "true") {
      return stage.querySelector("[data-document-start]");
    }

    const screen = document.createElement("div");
    const layout = document.createElement("div");
    const sidebarPanel = document.createElement("aside");
    const contentPanel = document.createElement("section");
    const contentHeader = document.createElement("div");
    const contentBody = document.createElement("div");
    const startSidebar = createDocumentStartSidebar();
    const startOverview = createDocumentStartOverview();
    const startProjects = createDocumentStartProjects();
    const recoveryHost = document.createElement("div");
    const presetGrid = document.createElement("div");

    screen.className = "document-start-screen";
    screen.dataset.documentStart = "";

    layout.className = "document-start-layout";

    sidebarPanel.className = "document-start-sidebar";
    sidebarPanel.setAttribute("aria-label", "Document start sidebar");

    contentPanel.className = "document-start-main";
    contentPanel.setAttribute("aria-label", "Document start content");

    contentHeader.className = "document-start-main-header";
    contentHeader.setAttribute("aria-hidden", "true");

    contentBody.className = "document-start-main-body";
    contentBody.append(startOverview.container, startProjects.section);

    sidebarPanel.append(
      startSidebar.brand,
      startSidebar.newProjectButton,
      startSidebar.allProjectsButton,
      startSidebar.templateButton,
      startSidebar.aiArchiveButton,
    );

    contentPanel.append(contentHeader, contentBody);

    recoveryHost.className = "document-start-recovery-host";
    recoveryHost.hidden = true;

    presetGrid.className = "document-start-presets";
    presetGrid.setAttribute("aria-label", "Document presets");
    presetGrid.append(...getDocumentPresets().map(createDocumentPresetButton));

    startSidebar.newProjectButton.addEventListener("click", () => {
      startDocumentFromPreset(getDocumentPreset(getDefaultDocumentPresetId()), "document-start-new-project");
    });

    startOverview.newProjectButton.addEventListener("click", () => {
      startDocumentFromPreset(getDocumentPreset(getDefaultDocumentPresetId()), "document-start-overview-new-project");
    });

    startProjects.createCard.addEventListener("click", () => {
      startDocumentFromPreset(getDocumentPreset(getDefaultDocumentPresetId()), "document-start-project-card-create");
    });

    presetGrid.addEventListener("click", (event) => {
      const button = event.target.closest("[data-document-preset]");

      if (!button) {
        return;
      }

      startDocumentFromPreset(getDocumentPreset(button.dataset.documentPreset));
    });

    layout.append(sidebarPanel, contentPanel);
    screen.append(layout);
    editorPage?.classList.add("document-start-active");
    stage.dataset.documentStartReady = "true";
    stage.replaceChildren(screen);

    const saveSystem = namespace.documentSaveSystem;

    if (saveSystem?.listSummaries && saveSystem?.restore) {
      renderSavedProjects(stage, startProjects, saveSystem);
    } else if (saveSystem?.getLatestSummary && saveSystem?.restoreLatest) {
      renderLatestRecoverableProject(stage, recoveryHost, saveSystem);
    }

    requestAnimationFrame(() => {
      startSidebar.newProjectButton.focus();
    });

    return screen;
  };
})(window.CBO = window.CBO || {});
