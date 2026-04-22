window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const templates = window.CBO_TEMPLATES || [];
  const mockupCategories = window.CBO_MOCKUP_CATEGORIES || [];
  const drawerPanel = document.querySelector(".left-drawer");
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");
  const previewLimit = 6;
  let scrollbarFrame = 0;
  let activePanel = "elements";
  let activeCategory = null;

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
    drawerPanel.dataset.drawerPanel = activePanel;
    drawerContent.classList.toggle("template-mode", isTemplatePanel);
    drawerContent.classList.toggle("mockup-mode", isMockupPanel);
    activeCategory = null;
    searchInput.value = "";
    filterDrawerSections();
    drawerContent.scrollTop = 0;
    scheduleCustomScrollbarUpdate();
  }

  window.CBO.setDrawerPanel = function setDrawerPanel(panelName) {
    activePanel = ["template", "mockups"].includes(panelName) ? panelName : "elements";
    updateDrawerPanel();
  };

  renderDrawer();
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
