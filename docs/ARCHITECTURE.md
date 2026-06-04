# Architecture - Editor 2D CBOs

Questo file e la mappa ufficiale del progetto. Prima di fare modifiche future, leggere questo documento per capire dove cercare le cose senza rileggere tutta la codebase.

Revisione rapida: 2026-05-22, verificata contro file tree, `index.html`, `js/app.js`, `js/editor-canvas.js` e lista test.

## Scopo dell'app

Editor 2D web per clothing brand owner. L'app gira nel browser come sito statico e usa un canvas WebGL2 per disegno raster, livelli, artboard, mockup, testo vettoriale, forme, trasformazioni, pennelli, liquify push, riempimento colore, salvataggio locale e workspace AI/infinite canvas.

Non c'e un bundler evidente: gli script browser sono caricati direttamente da `index.html` in ordine preciso e condividono lo stato tramite `window.CBO`. Il `package.json` in root serve solo come punto comando standard per test, server locale e benchmark.

## Come avviare

Server statico consigliato dalla root del progetto:

```powershell
npm start
```

Comando diretto equivalente:

```powershell
py -m http.server 8000 --bind 0.0.0.0
```

URL locale desktop:

```text
http://localhost:8000/
```

URL mobile sulla stessa rete, gia indicato nel README:

```text
http://192.168.0.38:8000/
```

Nota importante: per prove mobile usare `http://192.168.0.38:8000/`, non porte temporanee.

## Comandi utili

Eseguire tutti i test Node:

```powershell
npm test
```

Eseguire un test mirato:

```powershell
npm run test:one -- tests/nome-file.test.js
```

Build WASM pixel worker, quando serve ricompilare `wasm/pixel_core.wasm`: vedere `WASM_BUILD.md`.

```bash
clang --target=wasm32 -O3 -nostdlib -fno-builtin -Wl,--no-entry -Wl,--export-memory -Wl,--export=reserve_stack -Wl,--export=flood_fill_dense_rgba -Wl,--export=flood_fill_sparse_rgba -o wasm/pixel_core.wasm wasm/pixel_core.c
```

## Struttura root

- `index.html`: markup principale, barre laterali, toolbar, stage editor e ordine di caricamento CSS/JS.
- `README.md`: nota su server statico e URL mobile.
- `WASM_BUILD.md`: istruzioni per compilare e testare il worker WASM.
- `css/`: stili divisi per area UI.
- `js/`: logica applicativa, motori, pannelli e tool.
- `js/document/`: modello documento, renderer WebGL, history, save/autosave, artboard.
- `js/artboard-connections/`: workspace AI/infinite canvas, board, collegamenti, media e testo.
- `data/`: categorie drawer, brush library e texture.
- `assets/`: mockup e sample AI board.
- `vendor/`: opentype e font locali.
- `wasm/`: sorgente C e binario WASM per pixel worker.
- `tests/`: 47 test Node usando `node:test`.
- `docs/`: baseline/report tecnici.
- `tools/`: script di benchmark.
- `eh/`: pagina HTML separata/extra.

## Architettura globale

Pattern principale:

- quasi tutti i file JS sono script browser plain, non moduli ES;
- lo stato pubblico vive in `window.CBO`;
- i moduli registrano classi, singleton e funzioni con assegnazioni tipo `window.CBO.DocumentRenderer = ...`;
- la comunicazione cross-module usa `CustomEvent` su `window`, con nomi `cbo:*`;
- l'ordine degli script in `index.html` e importante: se aggiungi un file, controlla dipendenze e posizione.

Punto di bootstrap:

- `js/app.js` crea/configura `window.CBO`, flag Android/mobile, guardie gesture/touch, CSS vars viewport e init `DOMContentLoaded`.
- `js/editor-canvas.js` crea il canvas WebGL2 e le istanze runtime principali.
- `index.html` carica prima data/vendor/core document, poi UI, renderer, tool, artboard AI, e infine `js/app.js`.

## Boot flow

1. `index.html` disegna shell statica: left rail, drawer, `.editor-stage`, right panel, bottom toolbar e history toolbar.
2. I CSS vengono caricati in testa. I principali sono `css/layout.css`, `css/base.css`, `css/top-toolbar.css`, `css/right-sidebar.css`, `css/layers-panel.css`, `css/brush-studio.css`.
3. Gli script creano API su `window.CBO`.
4. `js/app.js` su `DOMContentLoaded` esegue:
   - `initSidebar`
   - `initDrawer`
   - `initLayersPanel`
   - `initDragScroll`
   - `initTopToolbar`
   - `initVerticalToolbar`
   - `initLayerEffectsPanel`
   - `initArtboardPreview`
   - `initColorPicker`
   - `initColorDrop`
   - `initToolbar`
   - `initEditorDocumentStart` se presente, altrimenti `initEditorCanvas`
   - `initRightSidebar`
   - `initBrushesPanel`
   - `initBrushStudio`
   - `initTooltips`
5. Quando il canvas e pronto viene emesso `cbo:editor-canvas-ready`.
6. Dopo `cbo:editor-canvas-ready`, `app.js` inizializza tool dipendenti dal canvas:
   - `initBrushShapeOutlinePreview`
   - `initAreaSelectionTool`
   - `initRasterTransformTool`
   - `initPuppetTransformTool`
   - `initVectorTextRenderer`
   - `initVectorRectTool`

## Runtime principale

`js/editor-canvas.js` e il punto in cui nascono le istanze importanti:

- `window.CBO.documentLayerModel`: modello livelli, creato con `DocumentLayerModel`.
- `window.CBO.documentRenderer`: renderer WebGL2, creato con `DocumentRenderer`.
- `window.CBO.documentHistory`: history undo/redo, creata con `DocumentHistory` se non disabilitata.
- `window.CBO.brushEngine`: motore pennello, creato con `BrushEngine`.
- `window.CBO.liquifyEngine`: motore Liquify Push, creato con `LiquifyEngine`.
- `window.CBO.imageRasterizer`: import/rasterizzazione immagini, creato con `ImageRasterizer`.
- `window.CBO.documentSettings`: dimensioni documento/preset.

La funzione chiave e `window.CBO.initEditorCanvas(options)`.

Prima schermata/document start:

- `window.CBO.initEditorDocumentStart` in `js/editor-canvas.js`.
- Mostra preset documento e recupero progetti salvati.
- Chiama `initEditorCanvas` con dimensioni/preset scelti.

## File principali per area

### Utility/base condivise

- `js/icons.js`: icone HTML/SVG riusate da sidebar, drawer e altri controlli UI.
- `js/blend-modes.js`: definizioni blend mode usate da sidebar, layer e renderer.
- `js/curves-engine.js`: helper curve/Bezier e geometria vettoriale, richiesto da artboard, layer model e test curve.
- `js/stroke-math.js`: helper matematici per stroke, linee e input di disegno.

### Documento, livelli, renderer

- `js/document/document-layer-model.js`: struttura dei livelli, gruppi, artboard groups, layer metadata, effetti, duplicazione, active layer, serializzazione.
- `js/document/document-artboard-model.js`: modello artboard, selezione, movimento, collisioni, reset/creazione/cancellazione artboard.
- `js/document/document-renderer.js`: classe `DocumentRenderer`, init WebGL, canvas viewport, render loop e API base.
- `js/document/document-renderer-shaders.js`: shader/program source condivisi dal renderer.
- `js/document/document-renderer-webgl-programs.js`: programmi WebGL e setup risorse.
- `js/document/document-renderer-raster-targets.js`: raster target, cropped/sparse tiles, memoria, read/write pixel, snapshot.
- `js/document/document-renderer-compositing.js`: compositing dei livelli, clipping mask, blend modes, draw finale.
- `js/document/document-renderer-layer-effects.js`: rendering effetti layer nel renderer.
- `js/document/document-renderer-viewport-culling.js`: culling viewport, dirty regions, artboard residency, preview cache.
- `js/document/document-renderer-history-snapshots.js`: snapshot raster per history.
- `js/document/document-history.js`: undo/redo, gruppi history, budget memoria raster.
- `js/document/document-history-compression.js`: compressione history raster.
- `js/document/document-layer-merge.js`: merge layer, merge down, piani di merge e history.
- `js/document/document-bounds.js`: helper geometrici bbox/quad/rect.

### Salvataggio e storage

- `js/document/document-save-system.js`: salvataggio manuale multi-progetto in IndexedDB.
- `js/document/document-autosave.js`: autosave/checkpoint memoria e restore.
- `js/right-sidebar.js`: input nome progetto e pulsante save manuale.
- `js/editor-canvas.js`: schermata iniziale e restore da document save system.

IndexedDB/localStorage:

- `cbo-editor-documents`: save manuale.
- `cbo-editor-autosave`: autosave/memory checkpoint.
- `cbo-editor-uploads`: immagini caricate nel drawer upload.
- `cbo-project-name`: nome progetto in localStorage.
- `cbo:dirty-region-monitor-enabled`: flag debug dirty region monitor.
- `cbo:raster-memory-monitor-enabled`: flag debug raster memory monitor.

### UI principale

- `js/sidebar.js`: left rail open/close drawer.
- `js/drawer.js`: drawer template/elements/mockups/upload/layers, ricerca, IndexedDB upload.
- `js/layers-panel.js`: lista layer nel drawer, context menu, reference layer, clipping mask, merge, drag/reorder.
- `js/right-sidebar.js`: pannello proprieta: progetto/save, text controls, layer opacity/blend/align, liquify settings.
- `js/toolbar.js`: bottom toolbar principale, cambio tool, scorciatoie, undo/redo.
- `js/top-toolbar.js`: toolbar alta, quick brush controls, transform mode, mobile text panels, rasterize buttons.
- `js/vertical-toolbar.js`: toolbar verticale destra.
- `js/layer-effects-panel.js`: UI effetti layer e rasterizzazione effetti.
- `js/color-picker.js`: colore primario/secondario.
- `js/color-drop.js`: UI/entry point color fill.
- `js/tooltips.js`: tooltip desktop/mobile.

### Disegno, brush, liquify

- `js/brush-engine.js`: classe base `BrushEngine`.
- `js/brush-engine-stroke-input.js`: pointer input, tool brush/eraser, quick shape/quick line, coalescing mobile.
- `js/brush-engine-sampler.js`: campionamento stroke, spacing, pressione/velocita.
- `js/brush-engine-target-gpu.js`: target GPU, draw stroke, preview/live targets, bake, camera events.
- `js/brush-engine-shader-grain.js`: shader brush, grain, shape texture e cache immagini.
- `js/brush-engine-history.js`: history per stroke e report memoria.
- `js/brush-defaults.js`: schema/default impostazioni brush.
- `data/brush-library.js`: pacchetti brush e preset (`hard-blend`, `soft`).
- `js/brushes-panel.js`: UI libreria brush, mobile brush library, duplicate/delete/create brush.
- `js/brush-studio.js`: editor avanzato brush e anteprima.
- `js/brush-preview.js`: rendering anteprime brush.
- `js/brush-shape-outline-preview.js`: outline del pennello sul canvas.
- `js/liquify-engine.js`: Liquify Push WebGL, settings e history stroke.

### Riempimento colore

- `js/color-fill.js`: API pubblica `window.CBO.colorFill`, gestione fill, reference layer, clipping/selection barriers.
- `js/color-fill-worker.js`: modulo worker/fallback per flood fill.
- `js/color-fill-reference.js`: sampling reference layer.
- `js/color-fill-mask.js`: coverage/anti-alias mask.
- `js/color-fill-history.js`: history entries del fill.
- `js/pixel/pixel-worker-client.js`: client worker, fallback e history compression.
- `js/workers/pixel-worker.js`: worker effettivo, carica `wasm/pixel_core.wasm` quando possibile.
- `wasm/pixel_core.c` e `wasm/pixel_core.wasm`: flood fill dense/sparse in WASM.

### Testo e forme vettoriali

- `js/text/vector-text-engine.js`: calcoli testo, curve/trasformazioni e layout.
- `js/text/vector-text-renderer.js`: overlay SVG testo, interazione, raster cache nel renderer.
- `js/text/vector-text-rasterizer.js`: rasterizzazione manuale testo e history.
- `js/vector-rect-tool.js`: rettangoli vettoriali, overlay SVG, handles, fill.
- `vendor/opentype/opentype.min.js`: parsing font.
- `vendor/fonts/*.ttf` e `vendor/fonts/*.js`: font disponibili.

### Trasformazioni e selezioni

- `js/raster-transform-tool.js`: resize/rotate/perspective/warp su raster e metadata transform per text layer.
- `js/puppet-transform-tool.js`: puppet transform e rasterizzazione.
- `js/resize-button.js`, `js/rotate-button.js`, `js/puppet-button.js`, `js/file-adjustments-button.js`: bottoni/tool launcher.
- `js/area-selection-tool.js`: selezioni rettangolo/lasso/ellipse/color range, copy/paste/delete, clipping brush/fill.
- `js/selection-region.js`: struttura dati regioni selezione e maschere.

### Artboard, mockup, AI board

- `js/artboard-preview.js`: preview/interazione artboard, selezione e drag artboard, UI create artboard.
- `js/artboard-connections.js`: controller overlay e API pubbliche del workspace AI.
- `js/artboard-connections/core.js`: classe `ArtboardConnectionsController`.
- `js/artboard-connections/core-helpers.js`: helper coordinate/board.
- `js/artboard-connections/layers-and-grid.js`: layer/grid/simmetria verticale artboard.
- `js/artboard-connections/ai-board-*.js`: AI image board, toolbar, DOM, generation, media, runtime preview, edit preview, enlarge viewer, text board.
- `js/artboard-connections/space-board-*.js`: space/text prompt boards.
- `js/artboard-connections/connection-*.js`: DOM/render/actions collegamenti.
- `js/artboard-connections/placement.js`: posizionamento board/artboard.
- `js/artboard-connections/state-history.js`: history stato connessioni.
- `data/categories.js`: categorie drawer, mockup library e addon mockup.
- `assets/mockups/`: immagini/SVG mockup.
- `assets/ai-board-samples/`: sample immagini/video AI board.

### Import immagini e mockup

- `js/drawer.js`: upload immagini, storage `cbo-editor-uploads`, mockup item click.
- `js/editor-canvas.js`: `placeUploadedImageOnCanvas`, `openMockupAsset`, `addMockupAssetToArtboard`.
- `js/images/image-rasterizer.js`: decode/rasterize immagini in target WebGL, limiti memoria e metadata.
- `data/categories.js`: definizione `HOODIE_BODY_1_MOCKUP`, `HOODIE_DETAIL_1_MOCKUP`, categorie mockup.

### Debug e performance

- `js/debug/performance-trace.js`: tracing performance.
- `js/debug/dirty-region-monitor.js`: monitor dirty regions.
- `js/debug/dirty-region-overlay.js`: overlay dirty region.
- `js/debug/raster-memory-monitor.js`: monitor/recovery memoria raster.
- `js/debug/raster-memory-report.js`: report memoria.
- `js/debug/raster-resource-manager.js`: accounting risorse raster.
- `js/debug/raster-history-tile-overlay.js`: overlay tile history.
- `js/debug/raster-layer-tile-overlay.js`: overlay sparse layer.
- `js/debug/layer-blend-console.js`: debug blend.
- `js/debug/engine-governor.js`: governor/controlli motore.

Molti debug helper non sono caricati da `index.html` di default; i test verificano proprio che restino disponibili ma non sempre caricati.

## Eventi `cbo:*` importanti

Questa lista e una mappa pratica, non un inventario esaustivo. Per audit completi usare:

```powershell
rg -o "cbo:[A-Za-z0-9-]+" js | Sort-Object -Unique
```

Eventi backbone:

- `cbo:editor-canvas-ready`: canvas e renderer pronti; inizializza tool dipendenti.
- `cbo:editor-canvas-reset`: restore/reset documento.
- `cbo:tool-change`: cambio tool globale.
- `cbo:camera-change`: pan/zoom/camera.
- `cbo:document-layers-change`: struttura layer cambiata.
- `cbo:document-layers-merged`: merge livelli completato.
- `cbo:document-content-change`: pixel/visual content cambiato.
- `cbo:history-action`: undo/redo richiesti.
- `cbo:before-history-action`: hook prima di undo/redo.
- `cbo:before-raster-history-capture`: hook prima di catturare history raster.
- `cbo:history-change`: stato undo/redo cambiato.
- `cbo:history-disabled`: history disabilitata o non disponibile.

Artboard e AI:

- `cbo:document-artboards-change`
- `cbo:document-artboard-selection-change`
- `cbo:artboard-preview-change`
- `cbo:artboard-selection-change`
- `cbo:artboard-connections-change`
- `cbo:artboard-symmetry-change`
- `cbo:artboard-residency-busy`
- `cbo:ai-image-board-generate-click`

Brush/fill/effects:

- `cbo:brush-settings-change`
- `cbo:brush-settings-preview-change`
- `cbo:brush-tool-reactivate`
- `cbo:paint-settings-change`
- `cbo:color-fill-reference-change`
- `cbo:area-selection-change`
- `cbo:area-selection-operation-change`
- `cbo:color-range-sample-change`
- `cbo:color-range-tolerance-change`
- `cbo:layer-effects-rasterized`
- `cbo:image-layer-rasterized`
- `cbo:vector-text-rasterized`
- `cbo:puppet-rasterized`

Transform/mobile:

- `cbo:transform-mode-change`
- `cbo:raster-transform-action`
- `cbo:raster-transform-state-change`
- `cbo:raster-transform-rotation-input`
- `cbo:text-transform-edit-request`
- `cbo:mobile-object-move-change`
- `cbo:touch-navigation-start`
- `cbo:touch-navigation-end`

Save/debug:

- `cbo:document-project-change`
- `cbo:document-save-status`
- `cbo:document-save`
- `cbo:document-save-restored`
- `cbo:document-autosave`
- `cbo:document-autosave-restored`
- `cbo:document-memory-checkpoint`
- `cbo:place-uploaded-image`
- `cbo:open-mockup-asset`
- `cbo:add-mockup-asset-to-artboard`
- `cbo:performance-trace`
- `cbo:dirty-region-monitor-enabled`
- `cbo:preview-dirty-region-debug`
- `cbo:raster-history-tile-debug`
- `cbo:raster-memory-monitor-enabled`
- `cbo:raster-memory-auto-recovery`
- `cbo:viewport-culling-debug`

## CSS mappa rapida

- `css/base.css`: reset/base e regole globali.
- `css/layout.css`: layout editor, stage, responsive/mobile, molti dettagli principali.
- `css/left-sidebar.css`: rail sinistra.
- `css/drawer.css`: drawer sinistro e contenuti.
- `css/layers-panel.css`: lista livelli e context menu.
- `css/right-sidebar.css`: pannello proprieta destro.
- `css/toolbar.css`: bottom toolbar.
- `css/top-toolbar.css`: top toolbar, quick brush, mobile text/transform controls.
- `css/vertical-toolbar.css`: toolbar verticale.
- `css/layer-effects-panel.css`: pannello effetti.
- `css/brushes-panel.css`: libreria brush.
- `css/brush-studio.css`: brush studio.
- `css/color-picker.css`: picker colore.
- `css/color-drop.css`: color drop/fill controls.
- `css/tooltips.css`: tooltip.

## Test: dove guardare

Test mirati principali:

- Artboard / AI board / mockup: `tests/artboard-preview.test.js`, `tests/mockup-library.test.js`.
- Brush engine: `tests/brush-engine-history.test.js`, `tests/brush-engine-navigation.test.js`, `tests/brush-engine-shape-mask.test.js`, `tests/brush-quick-line.test.js`, `tests/brush-velocity-pressure.test.js`.
- Brush UI/studio: `tests/brush-preview-isolation.test.js`, `tests/brush-shape-outline-preview.test.js`, `tests/brush-studio-alpha-import.test.js`, `tests/brush-library-soft.test.js`, `tests/mobile-brush-controls.test.js`, `tests/mobile-brush-library.test.js`.
- Color fill: `tests/color-fill.test.js`, `tests/pixel-worker-wasm.test.js`.
- Document/layers/history/save: `tests/document-history.test.js`, `tests/document-history-compression.test.js`, `tests/document-layer-model-history.test.js`, `tests/document-layer-merge.test.js`, `tests/document-save-system.test.js`, `tests/document-autosave.test.js`, `tests/document-start-screen.test.js`, `tests/layer-sidebar.test.js`, `tests/layer-duplicate.test.js`, `tests/clipping-mask.test.js`.
- Renderer/memory/performance: `tests/document-renderer-pruning.test.js`, `tests/raster-memory-monitor.test.js`, `tests/raster-resource-manager.test.js`, `tests/raster-history-tile-overlay.test.js`, `tests/performance-trace.test.js`, `tests/dirty-region-monitor.test.js`, `tests/image-rasterizer-memory.test.js`.
- Transform/selection: `tests/raster-transform-tool.test.js`, `tests/resize-transform-toolbar.test.js`, `tests/puppet-transform-tool.test.js`, `tests/area-selection-tool.test.js`, `tests/selection-region.test.js`, `tests/mobile-transform-toolbar.test.js`.
- Text/vector/curves: `tests/vector-text-compositing.test.js`, `tests/vector-rect-tool.test.js`, `tests/curves-engine.test.js`.
- UI controls: `tests/toolbar-history.test.js`, `tests/tooltips.test.js`, `tests/vertical-toolbar.test.js`, `tests/top-toolbar-liquify.test.js`, `tests/color-picker.test.js`, `tests/layer-effects-panel.test.js`, `tests/liquify-sidebar.test.js`.

La maggior parte dei test legge i sorgenti con `fs.readFileSync`, regex e VM sandbox; pochi richiedono vere API browser. Se cambi stringhe/ordine script/API pubbliche, aggiornare i test corrispondenti.

## Feature lookup: se devi modificare X

- Avvio app, init order, gesture mobile: `js/app.js`, `index.html`, test `brush-engine-navigation`, `brush-shape-outline-preview`, `layer-effects-panel`.
- Creazione canvas/documento/preset/start screen: `js/editor-canvas.js`, `tests/document-start-screen.test.js`, `tests/document-save-system.test.js`.
- Salvataggio manuale: `js/document/document-save-system.js`, `js/right-sidebar.js`, `js/editor-canvas.js`, `tests/document-save-system.test.js`.
- Autosave/checkpoint restore: `js/document/document-autosave.js`, `js/debug/raster-memory-monitor.js`, `tests/document-autosave.test.js`.
- Layer list, context menu, duplicate/merge: `js/layers-panel.js`, `js/document/document-layer-model.js`, `js/document/document-layer-merge.js`, test `layer-sidebar`, `layer-duplicate`, `document-layer-merge`.
- Layer effects: `js/layer-effects-panel.js`, `js/document/document-renderer-layer-effects.js`, `tests/layer-effects-panel.test.js`.
- Opacity/blend/alignment sidebar: `js/right-sidebar.js`, `js/blend-modes.js`, `tests/layer-sidebar.test.js`.
- Rendering/compositing/clipping mask: `js/document/document-renderer*.js`, `tests/clipping-mask.test.js`, `tests/document-renderer-pruning.test.js`.
- Sparse tiles/memoria raster: `js/document/document-renderer-raster-targets.js`, `js/debug/raster-resource-manager.js`, `tests/document-renderer-pruning.test.js`, `tests/raster-resource-manager.test.js`.
- Brush drawing/performance: `js/brush-engine*.js`, `data/brush-library.js`, `tests/brush-engine-history.test.js`, `tests/brush-engine-navigation.test.js`.
- Brush UI/studio: `js/brushes-panel.js`, `js/brush-studio.js`, `js/brush-preview.js`, `css/brushes-panel.css`, `css/brush-studio.css`.
- Liquify: `js/liquify-engine.js`, `js/right-sidebar.js`, `tests/liquify-engine.test.js`, `tests/liquify-sidebar.test.js`.
- Color picker/drop/fill: `js/color-picker.js`, `js/color-drop.js`, `js/color-fill*.js`, `js/pixel/pixel-worker-client.js`, `js/workers/pixel-worker.js`, `tests/color-fill.test.js`.
- WASM fill: `wasm/pixel_core.c`, `wasm/pixel_core.wasm`, `WASM_BUILD.md`, `tests/pixel-worker-wasm.test.js`.
- Upload immagini: `js/drawer.js`, `js/editor-canvas.js`, `js/images/image-rasterizer.js`, `tests/image-rasterizer-memory.test.js`.
- Mockup library: `data/categories.js`, `assets/mockups/`, `js/drawer.js`, `js/editor-canvas.js`, `tests/mockup-library.test.js`.
- Artboard preview/model: `js/artboard-preview.js`, `js/document/document-artboard-model.js`, `tests/artboard-preview.test.js`.
- AI/infinite canvas board: `js/artboard-connections.js`, `js/artboard-connections/*.js`, `assets/ai-board-samples/`, `tests/artboard-preview.test.js`.
- Testo vettoriale: `js/text/vector-text-*.js`, `js/right-sidebar.js`, `js/top-toolbar.js`, `tests/vector-text-compositing.test.js`.
- Forme vettoriali: `js/vector-rect-tool.js`, `tests/vector-rect-tool.test.js`.
- Raster transform/warp/perspective: `js/raster-transform-tool.js`, `js/top-toolbar.js`, `tests/raster-transform-tool.test.js`, `tests/resize-transform-toolbar.test.js`.
- Puppet transform: `js/puppet-transform-tool.js`, `js/puppet-button.js`, `tests/puppet-transform-tool.test.js`.
- Area selection: `js/area-selection-tool.js`, `js/selection-region.js`, `js/top-toolbar.js`, `tests/area-selection-tool.test.js`, `tests/selection-region.test.js`.
- Mobile toolbar/gesture: `js/app.js`, `js/top-toolbar.js`, `js/toolbar.js`, `css/layout.css`, test `mobile-*` e `brush-engine-navigation`.
- Tooltip: `js/tooltips.js`, `css/tooltips.css`, `tests/tooltips.test.js`.
- Debug/performance overlays: `js/debug/*.js`, test `dirty-region-monitor`, `performance-trace`, `raster-history-tile-overlay`, `raster-memory-monitor`.

## Regole pratiche per modifiche future

- Controllare sempre `git status --short`: il worktree puo avere modifiche non nostre.
- Se tocchi UI caricata da `index.html`, verifica anche ordine script e query cache-busting dei tag `script`/`link`.
- Se aggiungi una nuova API pubblica, registrarla su `window.CBO` nello stile gia presente.
- Se aggiungi una comunicazione cross-module, preferire `CustomEvent("cbo:...")` con `detail` piccolo e stabile.
- Se modifichi layer/document renderer, valutare history, save/autosave e memory cleanup.
- Se modifichi raster target, considerare tre casi: full target, cropped target, sparse/tiled target.
- Se modifichi artboard, controllare anche layer artboard groups e AI board collision/placement.
- Se modifichi testo vettoriale, ricordare che esiste sia overlay SVG live sia cache/raster target compositato.
- Se modifichi brush, controllare mobile performance: Android usa flag e cap dedicati in `js/app.js` e renderer.
- Se modifichi fill, controllare reference layer, active selection e clipping mask barriers.
- Se modifichi save/autosave, mantenere compatibilita con payload IndexedDB e tile codec/fallback raw.
- Dopo modifiche, eseguire i test mirati prima del test suite intero.

## Note mobile/Android

`js/app.js` contiene flag Android importanti:

- `androidPerformanceMode`
- `androidRenderDprCap`
- `mobileRenderDprCap`
- `viewportLayerCullingEnabled`
- `androidPreviewCacheEnabled`
- `androidDirtyRegionsEnabled`
- `androidZoomOutPreviewCacheEnabled`
- `androidHistoryEnabled`
- `enableArtboardResidency`
- `enableArtboardFlatPreviews`
- `enableArtboardTileResidency`
- `androidFastTransformCommitEnabled`
- `androidLiveTransformPreviewEnabled`

Molti bug mobile dipendono da gesture/touch navigation guard, viewport visuale, safe areas e tool overlay. Prima di cambiare interazioni mobile leggere `js/app.js`, `js/toolbar.js`, `js/top-toolbar.js`, `css/layout.css`, e i test `mobile-*.test.js`.

## Note su WebGL, memoria e target

Il renderer usa WebGL2 e gestisce target raster per layer. I target possono essere:

- full canvas;
- cropped su rettangolo contenuto;
- sparse/tiled, utile per grandi documenti e artboard lontani.

Percorsi delicati:

- snapshot history in `document-renderer-history-snapshots.js`;
- target/sparse/copy-on-write in `document-renderer-raster-targets.js`;
- compositing e clipping in `document-renderer-compositing.js`;
- viewport culling e artboard residency in `document-renderer-viewport-culling.js`;
- memory monitor/resource manager in `js/debug/`.

Quando un cambio produce pixel invisibili, undo rotto o memoria alta, cercare prima in questi file.

## Stato mentale consigliato per Codex

Per lavorare velocemente:

1. Leggere questa mappa.
2. Cercare il feature lookup relativo.
3. Aprire solo 2-5 file mirati.
4. Controllare i test mirati.
5. Fare patch piccola.
6. Eseguire `node --test tests/<test>.test.js`.
7. Solo se serve, avviare server statico e verificare in browser/mobile.

Questo progetto e ampio ma molto coerente: `window.CBO`, eventi `cbo:*`, file per area, test mirati. Il modo piu sicuro di intervenire e seguire quei confini.
