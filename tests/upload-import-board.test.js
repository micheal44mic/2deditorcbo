const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const repoRoot = path.resolve(__dirname, "..");

function readRepoFile(...parts) {
  return fs.readFileSync(path.join(repoRoot, ...parts), "utf8");
}

function extractFunctionSource(source, functionName) {
  const start = source.indexOf(`function ${functionName}(`);

  assert.notEqual(start, -1, `${functionName} should exist`);

  const bodyStart = source.indexOf("{", start);
  let depth = 0;

  for (let index = bodyStart; index < source.length; index += 1) {
    const character = source[index];

    if (character === "{") {
      depth += 1;
    } else if (character === "}") {
      depth -= 1;
    }

    if (depth === 0) {
      return source.slice(start, index + 1);
    }
  }

  assert.fail(`Unable to extract ${functionName}`);
}

test("upload masonry column heights are compared numerically", () => {
  const drawerSource = readRepoFile("js", "drawer.js");
  const getUploadColumnStackHeightSource = extractFunctionSource(
    drawerSource,
    "getUploadColumnStackHeight",
  );
  const getShortestUploadColumnSource = extractFunctionSource(
    drawerSource,
    "getShortestUploadColumn",
  );
  const getShortestUploadColumn = new Function(`
    ${getUploadColumnStackHeightSource}
    ${getShortestUploadColumnSource}
    return getShortestUploadColumn;
  `)();
  const tallerLeftColumn = { dataset: { stackHeight: "10.25" } };
  const shorterRightColumn = { dataset: { stackHeight: "9.75" } };

  assert.equal(
    getShortestUploadColumn([tallerLeftColumn, shorterRightColumn]),
    shorterRightColumn,
  );
});

test("external media import saves uploads and creates AI image or video boards", () => {
  const drawerSource = readRepoFile("js", "drawer.js");
  const connectionsSource = readRepoFile("js", "artboard-connections.js");
  const connectionActionsSource = readRepoFile("js", "artboard-connections", "connection-actions.js");
  const mediaSource = readRepoFile("js", "artboard-connections", "ai-board-media.js");
  const runtimePreviewSource = readRepoFile("js", "artboard-connections", "ai-board-runtime-preview.js");
  const spaceBoardRenderSource = readRepoFile("js", "artboard-connections", "space-board-render.js");
  const drawerCssSource = readRepoFile("css", "drawer.css");
  const indexSource = readRepoFile("index.html");

  assert.match(drawerSource, /const uploadUriPrefix = "cbo-upload:\/\/"/);
  assert.match(drawerSource, /input\.accept = "image\/\*,video\/\*"/);
  assert.match(drawerSource, /function isVideoFile\(file\)/);
  assert.match(drawerSource, /function getUploadMediaFilesFromDataTransfer\(dataTransfer, namePrefix = "media"\)/);
  assert.match(drawerSource, /function dataTransferHasUploadMedia\(dataTransfer\)/);
  assert.match(drawerSource, /String\(item\.type \|\| ""\)\.startsWith\("video\/"\)/);
  assert.match(drawerSource, /document\.addEventListener\("drop",/);
  assert.match(drawerSource, /document\.addEventListener\("paste",/);
  assert.match(drawerSource, /window\.CBO\.importUploadedImageFiles = importUploadedImageFiles/);
  assert.match(drawerSource, /window\.CBO\.importUploadedMediaFiles = importUploadedImageFiles/);
  assert.match(drawerSource, /window\.CBO\.resolveUploadedImageObjectUrl = resolveUploadedImageObjectUrl/);
  assert.match(drawerSource, /window\.CBO\.createAiImageBoardFromUpload/);
  assert.match(drawerSource, /function closeDrawerAfterUploadPlacement\(\) \{\s*window\.CBO\.closeDrawerPanel\?\.\(\);/);
  assert.match(drawerSource, /closeDrawerAfterUploadPlacement\(\);\s*if \(getUploadMediaKind\(record\) === "video"\)/);

  assert.match(connectionActionsSource, /Controller\.prototype\.createAiImageBoardFromUpload/);
  assert.match(connectionActionsSource, /Controller\.prototype\.getImportedAiImageBoardSize/);
  assert.match(connectionActionsSource, /return \{\s*height: sourceHeight,\s*width: sourceWidth,\s*\}/);
  assert.doesNotMatch(connectionActionsSource, /const maxSide = AI_IMAGE_BOARD_SIZE_DOC_PX/);
  assert.match(connectionActionsSource, /const mediaKind = options\.kind === "video" \? "video" : "image"/);
  assert.match(connectionActionsSource, /generationKind: mediaKind/);
  assert.match(connectionActionsSource, /kind: mediaKind/);
  assert.match(connectionActionsSource, /uploadSource: "cbo-editor-uploads"/);
  assert.match(connectionActionsSource, /source: "space-board-import-upload"/);
  assert.match(connectionsSource, /namespace\.createAiImageBoardFromUpload = function createAiImageBoardFromUpload/);

  assert.match(mediaSource, /Controller\.prototype\.resolveAiImageBoardUploadMediaSrc/);
  assert.match(mediaSource, /namespace\.getUploadedImageObjectUrl\?\.\(uploadId\)/);
  assert.match(mediaSource, /namespace\.resolveUploadedImageObjectUrl\?\.\(uploadId\)/);
  assert.match(runtimePreviewSource, /resolveAiImageBoardMediaForRender\(board\?\.generatedMedia \|\| null\)/);
  assert.match(spaceBoardRenderSource, /const generatedMedia = typeof resolveAiImageBoardMediaForRender === "function"/);

  assert.match(drawerCssSource, /body\.cbo-upload-drop-active::after/);
  assert.match(drawerCssSource, /content: "DROP MEDIA"/);
  assert.match(indexSource, /aria-label="Upload media"/);
  assert.match(indexSource, /drawer\.js\?v=upload-masonry-stack-v1/);
  assert.match(indexSource, /connection-actions\.js\?v=upload-media-board-v1/);
});
