window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const templates = window.CBO_TEMPLATES || [];
  const mockups = window.CBO_MOCKUPS || [];
  const drawerPanel = document.querySelector(".left-drawer");
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");
  const previewLimit = 6;
  let activePanel = "elements";
  let activeCategory = null;

  function getItemTags(item) {
    return Array.isArray(item) ? item : item.tags || [];
  }

  function getItemSrc(item) {
    return Array.isArray(item) ? "" : item.src || "";
  }

  function getItemAlt(item, categoryTitle) {
    return Array.isArray(item) ? categoryTitle : item.alt || categoryTitle;
  }

  function createImagePlaceholder(categoryTitle, categoryItem, index) {
    const tags = getItemTags(categoryItem);
    const src = getItemSrc(categoryItem);
    const item = document.createElement("span");
    item.className = "drawer-image-placeholder";
    item.dataset.tags = tags.join(" ");
    item.dataset.category = categoryTitle.toLowerCase();
    item.dataset.preview = index < previewLimit ? "true" : "false";

    if (src) {
      const image = document.createElement("img");
      image.className = "drawer-image";
      image.src = src;
      image.alt = getItemAlt(categoryItem, categoryTitle);
      item.append(image);
    }

    return item;
  }

  function matchesTags(tags, queryTags) {
    return (
      queryTags.length === 0 ||
      queryTags.every((queryTag) => tags.some((tag) => tag.includes(queryTag)))
    );
  }

  function renderDrawer() {
    drawerContent.replaceChildren();

    const searchResults = document.createElement("div");
    searchResults.className = "drawer-search-results";
    drawerContent.append(searchResults);

    const templateGrid = document.createElement("div");
    templateGrid.className = "drawer-template-grid";
    drawerContent.append(templateGrid);

    const mockupGrid = document.createElement("div");
    mockupGrid.className = "drawer-mockup-grid";
    drawerContent.append(mockupGrid);

    templates.forEach((templateItem, index) => {
      const item = createImagePlaceholder("template", templateItem, index);
      item.classList.add("drawer-template-placeholder");
      templateGrid.append(item);
    });

    mockups.forEach((mockupItem, index) => {
      const item = createImagePlaceholder("mockup", mockupItem, index);
      item.classList.add("drawer-mockup-placeholder");
      mockupGrid.append(item);
    });

    categories.forEach((category) => {
      const section = document.createElement("section");
      section.className = "drawer-section";
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
      drawerContent.append(section);
    });
  }

  function renderSearchResults(queryTags) {
    const searchResults = drawerContent.querySelector(".drawer-search-results");
    searchResults.replaceChildren();

    categories.forEach((category) => {
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
    const mockupItems = drawerContent.querySelectorAll(".drawer-mockup-grid [data-tags]");

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
    if (activePanel !== "elements") {
      drawerContent.classList.remove("category-mode", "search-mode");
      const queryTags = normalizeSearch(searchInput.value);
      filterTemplates(activePanel === "template" ? queryTags : []);
      filterMockups(activePanel === "mockups" ? queryTags : []);
      return;
    }

    const queryTags = normalizeSearch(searchInput.value);
    const sections = drawerContent.querySelectorAll(".drawer-section");
    const isSearchMode = queryTags.length > 0;
    const hasCategoryScope = Boolean(activeCategory);
    const isCategoryMode = hasCategoryScope && !isSearchMode;

    drawerContent.classList.toggle("category-mode", isCategoryMode);
    drawerContent.classList.toggle("search-mode", isSearchMode);

    if (isSearchMode) {
      renderSearchResults(queryTags);
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
  }

  function updateDrawerPanel() {
    const isTemplatePanel = activePanel === "template";
    const isMockupPanel = activePanel === "mockups";
    drawerPanel.dataset.drawerPanel = activePanel;
    drawerContent.classList.toggle("template-mode", isTemplatePanel);
    drawerContent.classList.toggle("mockup-mode", isMockupPanel);
    activeCategory = null;
    searchInput.value = "";
    filterDrawerSections();
    drawerContent.scrollTop = 0;
  }

  window.CBO.setDrawerPanel = function setDrawerPanel(panelName) {
    activePanel = ["template", "mockups"].includes(panelName) ? panelName : "elements";
    updateDrawerPanel();
  };

  renderDrawer();
  updateDrawerPanel();

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
};
