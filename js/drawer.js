window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");
  const previewLimit = 6;
  let activeCategory = null;

  function getItemTags(item) {
    return Array.isArray(item) ? item : item.tags || [];
  }

  function getItemColor(item) {
    return Array.isArray(item) ? "" : item.color || "";
  }

  function createImagePlaceholder(categoryTitle, categoryItem, index) {
    const tags = getItemTags(categoryItem);
    const color = getItemColor(categoryItem);
    const item = document.createElement("span");
    item.className = "drawer-image-placeholder";
    item.dataset.tags = tags.join(" ");
    item.dataset.category = categoryTitle.toLowerCase();
    item.dataset.preview = index < previewLimit ? "true" : "false";

    if (color) {
      item.style.setProperty("--placeholder-color", color);
    }

    const tagLabel = document.createElement("span");
    tagLabel.className = "drawer-image-tags";
    tagLabel.textContent = tags.map((tag) => `#${tag}`).join(" ");
    item.append(tagLabel);

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

  function normalizeSearch(value) {
    return value
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .map((token) => token.replace(/^#/, ""))
      .filter(Boolean);
  }

  function filterDrawerSections() {
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

  renderDrawer();
  filterDrawerSections();

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
