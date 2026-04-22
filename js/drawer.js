window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");
  let activeCategory = null;

  function renderDrawer() {
    drawerContent.replaceChildren();

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

      category.items.forEach((tags) => {
        const item = document.createElement("span");
        item.className = "drawer-image-placeholder";
        item.dataset.tags = tags.join(" ");
        item.dataset.category = category.title.toLowerCase();
        row.append(item);
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

  function normalizeSearch(value) {
    return value.trim().toLowerCase().replace(/^#/, "");
  }

  function filterDrawerSections() {
    const query = normalizeSearch(searchInput.value);
    const sections = drawerContent.querySelectorAll(".drawer-section");

    drawerContent.classList.toggle("category-mode", Boolean(activeCategory));

    sections.forEach((section) => {
      const sectionCategory = section.dataset.category;
      const items = Array.from(section.querySelectorAll("[data-tags]"));
      const seeAllCard = section.querySelector(".drawer-see-all-card");
      let visibleItems = 0;

      items.forEach((item) => {
        const tags = item.dataset.tags.toLowerCase();
        const matchesCategory = !activeCategory || item.dataset.category === activeCategory;
        const matchesQuery = query.length === 0 || tags.includes(query);
        const isVisible = matchesCategory && matchesQuery;

        item.classList.toggle("hidden", !isVisible);

        if (isVisible) {
          visibleItems += 1;
        }
      });

      section.classList.toggle(
        "hidden",
        (activeCategory && sectionCategory !== activeCategory) || visibleItems === 0,
      );
      seeAllCard.classList.toggle("hidden", query.length > 0 || Boolean(activeCategory));
    });
  }

  renderDrawer();

  searchInput.addEventListener("input", filterDrawerSections);
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    activeCategory = null;
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
