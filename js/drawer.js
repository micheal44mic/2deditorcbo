window.CBO = window.CBO || {};

window.CBO.initDrawer = function initDrawer() {
  const categories = window.CBO_CATEGORIES || [];
  const drawerContent = document.querySelector(".drawer-content");
  const searchInput = document.querySelector(".drawer-search input");
  const searchClear = document.querySelector(".drawer-search-clear");

  function renderDrawer() {
    drawerContent.replaceChildren();

    categories.forEach((category) => {
      const section = document.createElement("section");
      section.className = "drawer-section";
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

      const row = document.createElement("div");
      row.className = "drawer-image-container";

      category.items.forEach((tags) => {
        const item = document.createElement("span");
        item.className = "drawer-image-placeholder";
        item.dataset.tags = tags.join(" ");
        row.append(item);
      });

      const seeAllCard = document.createElement("button");
      seeAllCard.className = "drawer-see-all-card";
      seeAllCard.type = "button";
      seeAllCard.setAttribute("aria-label", `See all ${category.title}`);
      seeAllCard.innerHTML = window.CBO.icons.seeAll;

      row.append(seeAllCard);
      header.append(title, seeAll);
      section.append(header, row);
      drawerContent.append(section);
    });
  }

  function filterDrawerSections() {
    const query = searchInput.value.trim().toLowerCase().replace(/^#/, "");
    const sections = drawerContent.querySelectorAll(".drawer-section");

    sections.forEach((section) => {
      const title = section.querySelector(".drawer-section-title").textContent.toLowerCase();
      const imageTags = Array.from(section.querySelectorAll("[data-tags]"))
        .map((image) => image.dataset.tags)
        .join(" ")
        .toLowerCase();
      const matchesTitle = title.includes(query);
      const matchesTags = imageTags.includes(query);

      section.classList.toggle("hidden", query.length > 0 && !matchesTitle && !matchesTags);
    });
  }

  renderDrawer();

  searchInput.addEventListener("input", filterDrawerSections);
  searchClear.addEventListener("click", () => {
    searchInput.value = "";
    filterDrawerSections();
    searchInput.focus();
  });
};
