# Piano: move/resize layer raster con bbox fittata

## Obiettivo

Il tool `RESIZE` deve lavorare sul contenuto visibile del layer raster attivo, non sull'intera texture 4000x4000 del documento.

Quando il tool e' attivo e l'utente clicca su un layer paint/image, calcoliamo una bbox fittata sui pixel opachi del layer. Su quella bbox mostriamo il box di trasformazione e permettiamo:

- spostamento del contenuto del layer
- ingrandimento/riduzione con handle laterali e angolari
- mantenimento proporzioni con modificatore
- in seguito, free distortion e perspective distortion usando la toolbar gia' presente

Il risultato finale deve essere rasterizzato nel layer, con undo/redo come singola operazione.

## Stato attuale del codice

- I brush sono rasterizzati: durante lo stroke esistono `stampsBuffer` e texture temporanee, poi `bakeStroke()` fonde tutto nel target raster del layer.
- I layer paint/image hanno gia' un entry nel `DocumentLayerModel`, ma la texture reale e' document-size.
- `resize-button.js` crea il bottone `RESIZE`, e `top-toolbar.js` mostra la toolbar con `FREE TRANSFORM`, `PERSPECTIVE DISTORTION`, `FREE DISTORTION`.
- Non esiste ancora un controller del tool resize raster.
- Il testo vettoriale ha gia' una logica bbox buona:
  - `hasFiniteBounds`
  - `cloneBounds`
  - `expandBounds`
  - `offsetBounds`
  - `includeBounds`
  - `transformLayerPoint`
  - `transformLayerBounds`
  - `getClampedRasterBox`

Quella logica va resa condivisa, perche' e' esattamente il modello giusto anche qui: bounds in forma `{ x1, y1, x2, y2 }`, trasformazione dei quattro angoli, poi clamp nel documento.

## Scelta architetturale consigliata

Consiglio una trasformazione raster "preview live, commit distruttivo".

Durante il drag non modifichiamo i pixel del layer. Il renderer mostra una preview:

1. nasconde la bbox sorgente nella posizione originale
2. disegna una snapshot della bbox nella nuova posizione/scala

Al rilascio del mouse:

1. prendiamo una snapshot `before` della union tra bbox sorgente e bbox destinazione
2. cancelliamo la bbox sorgente nel target raster del layer
3. disegniamo la snapshot trasformata nel target raster
4. prendiamo una snapshot `after` della stessa union
5. pushiamo una history entry custom con undo/redo
6. distruggiamo le texture temporanee non piu' necessarie

Motivo: e' coerente con un editor raster. Non lasciamo un layer paint con trasformazioni persistenti difficili da conciliare con brush, eraser, smudge e puppet.

## Nuovi moduli/file

### 1. `js/document/document-bounds.js`

Modulo piccolo, puro, condiviso tra testo e resize raster.

Esportare in `window.CBO.documentBounds`:

```js
{
  hasFiniteBounds,
  cloneBounds,
  expandBounds,
  offsetBounds,
  includeBounds,
  rectToBounds,
  boundsToRect,
  transformPoint,
  transformBounds,
  getClampedRasterBox,
  getUnionRect,
}
```

Poi il testo puo' continuare a usare la stessa API, togliendo le copie private quando conviene.

### 2. `DocumentRenderer.getRasterContentBounds(layerId, options)`

Metodo nuovo in `js/document/document-renderer.js`.

Responsabilita':

- leggere l'alpha del target raster
- trovare la bbox fittata dei pixel con alpha sopra soglia
- restituire `{ x, y, width, height }` clamped al documento
- restituire `null` se il layer e' vuoto

Algoritmo consigliato:

1. coarse pass: riusare l'idea di `getPuppetAlphaSamples(target, cols, rows)` per campionare alpha a griglia bassa, tipo 256x256.
2. trovare una bbox grossolana.
3. espandere di qualche cella per sicurezza.
4. fare `readPixels` solo su quella regione full-res.
5. calcolare la bbox precisa pixel-by-pixel.
6. applicare padding minimo, per esempio 1-2 px, e clamp.

Questo evita di leggere sempre 64 MB da una texture 4000x4000 a ogni click.

### 3. `js/raster-transform-tool.js`

Nuovo controller del tool.

Pattern simile a `PuppetTransformTool`:

- crea un overlay SVG assoluto dentro `.editor-stage`
- ascolta:
  - `cbo:tool-change`
  - `cbo:transform-mode-change`
  - `cbo:camera-change`
  - `cbo:document-layers-change`
  - `cbo:document-content-change`
  - `resize`
- si attiva quando `toolMode === "resize"`
- lavora solo su layer non locked di tipo `paint` o `image`
- ignora `vector-text`, che ha gia' il proprio sistema; se serve, si rasterizza prima il testo

Stato interno:

```js
{
  activeTool: "resize",
  transformMode: "free",
  activeLayerId,
  contentRect,
  previewSnapshot,
  startQuad,
  currentQuad,
  dragState,
}
```

Interazione:

- attivazione tool: prova a calcolare la bbox del layer attivo
- click su pixel visibile: opzionalmente seleziona il topmost raster layer sotto il puntatore e calcola bbox
- click dentro box: move
- handle angolari/laterali: scale
- `Shift`: mantiene proporzioni
- `Alt`: scala dal centro, se vogliamo replicare il comportamento classico
- `Esc`: annulla preview
- `Enter` o pointerup: commit

### 4. CSS overlay

Nuove classi in `css/layout.css` o in un file dedicato:

- `.editor-raster-transform-overlay`
- `.editor-raster-transform-box`
- `.editor-raster-transform-handle`
- `.editor-raster-transform-edge`

L'overlay deve catturare gli eventi solo quando il tool e' attivo, come il puppet overlay.

### 5. Script loading/init

In `index.html`:

- aggiungere `document-bounds.js` prima di `vector-text-renderer.js`
- aggiungere `raster-transform-tool.js` dopo `document-renderer.js`/`editor-canvas.js` e prima di `app.js`, oppure comunque prima dell'inizializzazione

In `js/app.js`:

```js
window.CBO.initEditorCanvas();
window.CBO.initRasterTransformTool?.();
window.CBO.initPuppetTransformTool?.();
```

Meglio inizializzarlo dopo `initEditorCanvas()`, perche' servono `documentRenderer`, `documentLayerModel` e camera del `brushEngine`.

## Preview nel renderer

Serve una piccola estensione a `DocumentRenderer`.

API proposta:

```js
documentRenderer.setRasterTransformPreview({
  layerId,
  sourceRect,
  texture,
  quad,
  opacity,
});

documentRenderer.clearRasterTransformPreview(layerId);
```

Nel render:

1. quando si disegna il layer attivo in preview, il fragment shader deve azzerare alpha dentro `sourceRect`.
2. subito dopo, si disegna `texture` sulla `quad` corrente.

Per disegnare la preview conviene aggiungere un programma WebGL piccolo tipo `drawTexturedQuad`, simile al programma puppet:

- attributo `aDestPixel`
- attributo `aSourceUv`
- uniform camera/viewport
- texture premoltiplicata
- blending standard premultiplied alpha

Per `FREE TRANSFORM`, la quad resta rettangolare.
Per `FREE DISTORTION`, i quattro angoli diventano indipendenti.
Per `PERSPECTIVE DISTORTION`, serve una variante con homography/perspective-correct mapping.

## Commit raster

Il commit non deve usare la preview a schermo; deve scrivere nel target raster reale.

API proposta nel renderer:

```js
documentRenderer.commitRasterTransform({
  layerId,
  sourceSnapshot,
  sourceRect,
  destQuad,
  source: "raster-transform",
});
```

Passi:

1. calcolare `destBounds` dalla quad.
2. calcolare `dirtyRect = union(sourceRect, destBounds)` e clamp.
3. creare `beforeSnapshot = createRasterSnapshot(layerId, dirtyRect, "raster-transform-before")`.
4. cancellare `sourceRect` nel framebuffer del layer.
5. disegnare `sourceSnapshot.texture` nella `destQuad`.
6. creare `afterSnapshot = createRasterSnapshot(layerId, dirtyRect, "raster-transform-after")`.
7. pushare history custom:

```js
{
  type: "custom",
  layerId,
  source: "raster-transform",
  undo: () => renderer.restoreRasterSnapshot(layerId, beforeSnapshot),
  redo: () => renderer.restoreRasterSnapshot(layerId, afterSnapshot),
  destroy: () => {
    renderer.deleteRasterSnapshot(beforeSnapshot);
    renderer.deleteRasterSnapshot(afterSnapshot);
  },
}
```

La snapshot sorgente usata per disegnare la trasformazione va distrutta dopo il commit o cancel.

## Hit test e selezione layer

Minimo indispensabile:

- se c'e' un layer attivo valido, il resize tool lavora su quello.
- se l'utente clicca fuori dalla bbox, non parte il drag.

Versione migliore:

- su click in canvas, scorrere i renderable layer top-to-bottom.
- per ogni layer paint/image visibile e non locked, chiamare `getRasterAlphaAtPoint(layer.id, x, y)`.
- il primo con alpha sopra soglia diventa active layer.
- appena selezionato, calcolare la bbox fittata e mostrare handles.

Questa e' la UX piu' naturale: clicco un elemento raster e il tool si aggancia a lui.

## Modalita transform

### FREE TRANSFORM

Da implementare per prima.

Comportamenti:

- drag interno: sposta la bbox
- handle angolari: scala X/Y
- handle laterali: scala un asse
- `Shift`: conserva aspect ratio
- dimensione minima: 1 px o 2 px per evitare box invertiti ingestibili

Rotazione puo' arrivare subito dopo, ma non e' obbligatoria per sbloccare move/resize.

### FREE DISTORTION

Usa la stessa snapshot sorgente, ma invece di mantenere un rettangolo aggiorna i quattro punti della quad.

Comportamenti:

- drag corner: muove solo quel corner
- drag edge: muove i due corner dell'edge
- commit con textured quad a due triangoli

### PERSPECTIVE DISTORTION

Da fare dopo free distortion.

Richiede mapping prospettico corretto. La strada pulita:

- calcolare una homography da rect sorgente a quad destinazione
- passare parametri allo shader
- ricostruire UV in fragment shader

Se vogliamo evitare shader complesso all'inizio, lasciamo il bottone visibile ma non agganciato finche' free transform/free distortion sono solidi.

## Interazioni con altri sistemi

### Brush/eraser/smudge

Il tool resize deve catturare pointer events tramite overlay, quindi brush/eraser non ricevono il drag.

### Puppet

Se un layer ha `puppet.pins`, prima di resize conviene:

- o rasterizzare automaticamente il puppet quando si entra nel resize
- oppure bloccare il resize e chiedere di uscire dal puppet

Consiglio: rasterizzare automaticamente come gia' fa il puppet quando si cambia tool.

### Vector text

Non trasformare direttamente `vector-text` con il tool raster. Il testo vettoriale ha bbox e transform propri. Se l'utente vuole trattarlo come pixel, prima usa `RASTERIZE TEXT`.

### Empty layer

Se `getRasterContentBounds()` ritorna `null`, non mostriamo box. Il tool resta attivo.

## Test consigliati

Static/unit:

- `document-bounds` converte bounds/rect e clampa correttamente.
- `raster-transform-tool` ascolta `resize` e `transform-mode-change`.
- `resize-button` e `top-toolbar` restano coerenti.
- commit history usa `createRasterSnapshot`, `restoreRasterSnapshot`, `deleteRasterSnapshot`.

Manual/browser:

- disegnare un tratto piccolo su layer paint, attivare resize, bbox stretta sul tratto.
- trascinare: vecchia posizione nascosta, preview nella nuova posizione.
- pointerup: pixel spostati davvero.
- undo/redo: torna esattamente prima/dopo.
- ingrandire da corner: resize del contenuto, non della canvas intera.
- layer vuoto: nessun box.
- layer locked: nessun box/drag.
- layer sotto/sopra: click seleziona topmost visibile se implementiamo hit test.

## Ordine di implementazione

1. Estrarre `document-bounds.js` e collegarlo senza cambiare comportamento.
2. Aggiungere `getRasterContentBounds(layerId)` al renderer.
3. Creare overlay `RasterTransformTool` con bbox fittata e handles statici.
4. Implementare drag move con preview renderer.
5. Implementare commit move con history.
6. Implementare scale handles per `FREE TRANSFORM`.
7. Aggiungere hit test topmost layer su click.
8. Aggiungere `FREE DISTORTION`.
9. Aggiungere `PERSPECTIVE DISTORTION`.
10. Rifinire test e casi edge.

## Decisione da confermare

La prima versione completa utile dovrebbe essere:

- RESIZE attivo
- bbox fittata su alpha del layer raster
- move
- resize/scale
- preview corretta
- commit raster
- undo/redo

Distort e perspective possono usare la stessa base, ma conviene farli dopo che move/scale sono solidi.
