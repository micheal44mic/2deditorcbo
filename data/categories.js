/*
  Future item example:

  {
    src: "./assets/templates/flames/flame-01.png",
    alt: "Flame graphic",
    tags: ["flames", "fire", "streetwear"],
  }

  How it works:
  - The first 6 items appear in the category preview.
  - SEE ALL or the final arrow opens the full category grid.
  - Search matches the tags. If a category is open, search stays inside it.
*/
const TEMP_PREVIEW_ITEMS_TO_REMOVE = [
  { tags: ["temporary", "preview"] },
  { tags: ["temporary", "preview"] },
  { tags: ["temporary", "preview"] },
  { tags: ["temporary", "preview"] },
  { tags: ["temporary", "preview"] },
  { tags: ["temporary", "preview"] },
];

const TEMP_TEMPLATE_ITEMS_TO_REMOVE = [
  { tags: ["temporary", "template", "hoodie"] },
  { tags: ["temporary", "template", "tshirt"] },
  { tags: ["temporary", "template", "crewneck"] },
  { tags: ["temporary", "template", "zip"] },
  { tags: ["temporary", "template", "pants"] },
  { tags: ["temporary", "template", "shorts"] },
  { tags: ["temporary", "template", "cap"] },
  { tags: ["temporary", "template", "beanie"] },
  { tags: ["temporary", "template", "front"] },
  { tags: ["temporary", "template", "back"] },
  { tags: ["temporary", "template", "sleeve"] },
  { tags: ["temporary", "template", "pocket"] },
  { tags: ["temporary", "template", "oversize"] },
  { tags: ["temporary", "template", "regular"] },
  { tags: ["temporary", "template", "cropped"] },
  { tags: ["temporary", "template", "boxy"] },
  { tags: ["temporary", "template", "streetwear"] },
  { tags: ["temporary", "template", "luxury"] },
  { tags: ["temporary", "template", "sport"] },
  { tags: ["temporary", "template", "minimal"] },
  { tags: ["temporary", "template", "y2k"] },
  { tags: ["temporary", "template", "gothic"] },
  { tags: ["temporary", "template", "vintage"] },
  { tags: ["temporary", "template", "blank"] },
];

const HOODIE_BODY_1_MOCKUP = {
  id: "hoodie-body-1",
  name: "hoodie body 1",
  alt: "hoodie body 1",
  src: "./assets/mockups/hoodie-body-1.png?v=hoodie-body-1-2048-v1",
  type: "mockup",
  fit: "contain",
  artboardWidth: 2048,
  artboardHeight: 2048,
  placement: { x: 0, y: 0, width: 2048, height: 2048 },
  tags: ["mockup", "hats", "hoodie", "body", "hoodie-body-1"],
};

const HOODIE_DETAIL_1_MOCKUP = {
  id: "hoodie-detail-1",
  name: "hoodie detail 1",
  alt: "hoodie detail 1",
  src: "./assets/mockups/hoodie-detail-1.svg",
  type: "mockup-addon",
  fit: "contain",
  placement: { x: 0, y: 0, width: 2048, height: 2048 },
  tags: ["mockup", "hoodie", "detail", "hoodie-detail-1"],
};

const TEMP_HAT_MOCKUPS_TO_REMOVE = [
  HOODIE_BODY_1_MOCKUP,
  { tags: ["temporary", "mockup", "hats"] },
  { tags: ["temporary", "mockup", "hats"] },
  { tags: ["temporary", "mockup", "hats"] },
  { tags: ["temporary", "mockup", "hats"] },
  { tags: ["temporary", "mockup", "hats"] },
];

const TEMP_ACCESSORY_MOCKUPS_TO_REMOVE = [
  { tags: ["temporary", "mockup", "accessory"] },
  { tags: ["temporary", "mockup", "accessory"] },
  { tags: ["temporary", "mockup", "accessory"] },
  { tags: ["temporary", "mockup", "accessory"] },
  { tags: ["temporary", "mockup", "accessory"] },
  { tags: ["temporary", "mockup", "accessory"] },
];

window.CBO_TEMPLATES = TEMP_TEMPLATE_ITEMS_TO_REMOVE;

window.CBO_MOCKUP_CATEGORIES = [
  { title: "HATS", items: TEMP_HAT_MOCKUPS_TO_REMOVE },
  { title: "ACCESSORY", items: TEMP_ACCESSORY_MOCKUPS_TO_REMOVE },
];

window.CBO_MOCKUP_ADDON_LIBRARY = [
  HOODIE_DETAIL_1_MOCKUP,
];

window.CBO_CATEGORIES = [
  { title: "FLAMES", items: TEMP_PREVIEW_ITEMS_TO_REMOVE },
  { title: "Y2K", items: [] },
  { title: "SPIKES", items: [] },
  { title: "PATTERN", items: [] },
  { title: "SPARKS", items: [] },
  { title: "SKULLS", items: TEMP_PREVIEW_ITEMS_TO_REMOVE },
];
