# RUOLO E OBIETTIVO

Sei un Senior WebGL2 Graphics Architect. Stiamo costruendo il core rendering engine di un'app di pittura digitale ad alte performance, stile Procreate. La UI e' Vanilla JS sotto `window.CBO`.

Le impostazioni del pennello vivono in `window.CBO.brushSettings` e vengono comunicate al motore tramite l'evento custom `cbo:brush-settings-change`. L'engine WebGL non deve manipolare il DOM, tranne che per il proprio `<canvas>` e per i listener di input necessari.

# REGOLE RIGIDE

1. **Tecnologia core:** usare solo WebGL2 puro e GLSL ES 3.00. Niente Three.js, PixiJS o fallback Canvas2D nel motore di rendering principale.
2. **Niente line rendering:** e' vietato usare `gl.LINES` o `gl.LINE_STRIP` per tracciare pennellate.
3. **Niente `gl.POINTS` per i dab:** usare quad istanziati con `gl.drawArraysInstanced`, per evitare i limiti hardware di `GL_ALIASED_POINT_SIZE_RANGE`.
4. **Viewport-Camera-Document:**
   - il canvas HTML e' il viewport DPR-aware;
   - il documento e' in VRAM su FBO a risoluzione fissa;
   - la camera matematica `{ x, y, zoom }` proietta il documento nello shader;
   - niente CSS transform per zoom/pan del canvas.
5. **Caps VRAM:** lato lungo massimo 4096 desktop e 2048 mobile/touch, rispettando anche `gl.MAX_TEXTURE_SIZE`.
6. **Input:** usare PointerEvents. Convertire sempre screen/client space in document space applicando l'inversa della camera.
7. **Fallback hardware:** se `event.pointerType === "mouse"`, usare `pressure = 1.0`, `tiltX = 0`, `tiltY = 0`.
8. **Coordinate:** il documento usa coordinate stile DOM, con origine in alto a sinistra. Gli shader convertono correttamente verso clip space WebGL.

# STATO ATTUALE DEL MOTORE

Il file principale e' `js/brush-engine.js`.

Gia' implementato:

- WebGL2 init, shader compilation/linking, resource cleanup in `dispose()`.
- Canvas DPR-aware e documento FBO con aspect ratio del viewport.
- `baseTexture` + `baseFBO`: livello consolidato del documento, inizializzato bianco (o trasparente in modalita' preview).
- `strokeTexture` + `strokeFBO`: livello del tratto attivo, trasparente e separato dal base layer.
- Artboard shader: campiona `baseTexture`; durante il disegno sovrappone `strokeTexture`. Texture FBO con `MAG_FILTER = NEAREST` e `MIN_FILTER = LINEAR` (zoom in mostra pixel netti, zoom out resta liscio).
- Pixel grid nello shader artboard, fade in tra zoom 6x e 12x.
- Camera fit-to-screen, wheel zoom ancorato al cursore, pinch trackpad (Ctrl+wheel), pan con spazio + drag o middle mouse, flag `userManipulatedCamera` per non riterare con resize.
- PointerEvents con pointer capture.
- `screenToDocumentSpace()`.
- Catmull-Rom CPU con finestra a 4 punti.
- Spacing engine CPU con minimo rigido `1px`.
- Buffer stamp CPU `stampsBuffer`.
- Brush instancing GPU: quad unitario + `instanceVBO` con stride 56 byte: `x`, `y`, `pressure`, `alphaScale`, `sizeScale`, `rotation`, `color rgb`, dati Grain Moving.
- Rendering dab via `gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, count)`.
- Dab circolare procedurale con edge anti-aliasing e hardness configurabile.
- Colore reale via `brushState.color` -> `u_color`.
- Size reale via `brushState.radius` oppure `brushState.size`.
- Spacing reale via `brushState.spacing`, interpretato come frazione della dimensione.
- Spacing jitter reale via `brushState.spacingJitter`.
- Jitter reale dei dab via `brushState.jitterLateral` e `brushState.jitterLinear`.
- Pressure reale sulla dimensione del dab con `u_minSizeRatio` (default 0.15) per evitare il collasso a 0px su stylus a pressione bassa.
- Flow reale via `brushState.flow` -> `u_flow` come moltiplicatore di alpha per dab.
- Hardness reale via `brushState.hardness` -> `u_hardness`: 1 = bordo nitido, 0 = gradiente radiale puro.
- Falloff reale del tratto via `brushState.fallOff`, passato alla GPU come alpha per istanza.
- StreamLine/stabilization reali nel percorso input via `brushState.streamLineAmount`, `brushState.streamLinePressure` e `brushState.stabilizationAmount`.
- Opacity reale del tratto via `brushState.opacity`.
- Wet Mix v1 reale lato CPU via `brushState.wetDilution`, `wetCharge`, `wetAttack` e `wetnessJitter`: modula `alphaScale` per dab senza cambiare shader.
- Shape texture reale via `brushState.shapeAlphaSrc` -> `u_shapeTexture` con fallback al dab circolare procedurale.
- Shape dynamics reali: `shapeRotation`, `shapeScatter`, `shapeCount`, `shapeCountJitter`, `shapeFlipX`, `shapeFlipY`.
- Grain Texturized reale via `brushState.grainTextureSrc`: texture tileable campionata in document space, quindi bloccata alla canvas.
- Grain Scale/Depth reali via `grainTexturizedScale` e `grainTexturizedDepth`.
- Grain Blend Mode reale interno al brush, non al canvas/layer: usa il grain alpha come tono grayscale per modificare il colore del brush e una coverage conservativa. Prima ondata implementata: `multiply`, `darken`, `linear-burn`, `overlay`, `lighten`, `difference`.
- Grain Brightness/Contrast reali via `grainBrightness` e `grainContrast` (`-1..1`), applicati al grain alpha prima di invert/blend/depth.
- Grain Moving reale via `grainMode: "moving"`: sampling in spazio dab/stroke separato da Texturized, con Movement, Scale, Zoom, Rotation, Depth, Depth Minimum, Depth Jitter e Offset Jitter.
- Anti opacity build-up: i dab del tratto attivo vengono scritti in `strokeFBO` con `gl.blendEquation(gl.MAX)`, poi fusi in `baseFBO` da `bakeStroke()` su `pointerup` con blend pre-moltiplicato standard.
- PRNG per stroke seedato dal punto iniziale (LCG `Math.imul(seed, 1664525) + 1013904223`): jitter riproducibile, niente sfarfallio frame-by-frame.
- Registrazione raw sample per stroke (`recordedStroke` -> `lastRecordedStroke` su pointerup): permette il replay del tratto.
- Quick controls in alto: quando il tool BRUSH e' attivo, compaiono due toolbar orizzontali per `radius` e `opacity`.

# API PUBBLICA DEL BRUSHENGINE

Costruttore: `new BrushEngine(canvas, options?)`.

`options` (tutti opzionali):

- `getSettings: () => object` — callback che ritorna lo stato brush corrente. Se fornito, l'engine NON si iscrive all'evento globale `cbo:brush-settings-change`: il chiamante usa `setBrushState()`.
- `transparentBackground: boolean` — clear del baseFBO a `(0,0,0,0)` invece che a bianco.
- `singleStrokeMode: boolean` — ogni `pointerdown` chiama `clearAllLayers()` prima di iniziare il tratto. Utile per il preview pad.
- `disableNavigation: boolean` — niente wheel/zoom/pan/Space.
- `documentSizeCap: number` — cappa il lato lungo del documento (`policyCap` se omesso).

Metodi pubblici:

- `setBrushState(settings)` — sostituisce direttamente `this.brushState`.
- `clearAllLayers()` — pulisce base + stroke FBO.
- `replayLastStroke()` — re-disegna l'ultimo tratto cotto (usa `lastRecordedStroke`).
- `replayStroke(rawSamples)` — accetta un array esterno di raw sample e li replay-a end-to-end (clear + replay + bake).
- `dispose()` — cleanup completo (programmi, FBO, listener, cursor).

# STATO ATTUALE DEL BRUSH STUDIO

Il Brush Studio esiste in `js/brush-studio.js`.

I default del brush sono centralizzati in `js/brush-defaults.js` (`window.CBO.BrushDefaults`) e vanno riusati da toolbar/studio invece di duplicare nuovi campi.

Gia' presente nella UI (slider):

- `radius`
- `opacity`
- `spacing`
- `spacingJitter`
- `jitterLateral`
- `jitterLinear`
- `fallOff`
- `streamLineAmount`
- `streamLinePressure`
- `stabilizationAmount`
- Shape: alpha import/invert, rotation, scatter, count, count jitter, randomized, flip X/Y.
- Grain: texture import/invert, mode selector Moving/Texturized. Texturized ha scale/depth. Moving ha movement, scale, zoom, rotation, depth, depth minimum, depth jitter, offset jitter. Blend mode, brightness e contrast sono condivisi ma applicati nel ramo attivo.
- Nel menu Grain Blend Mode sono selezionabili solo i mode implementati (`multiply`, `darken`, `linear-burn`, `overlay`, `lighten`, `difference`); `color-burn`, `color-dodge`, `hard-mix`, `subtract`, `divide`, `height`, `linear-height` restano visibili ma disabilitati finche' non hanno una formula stabile.

Drawing Pad: ora usa il vero BrushEngine WebGL, NON piu' Canvas2D. Una seconda istanza di `BrushEngine` viene creata sul canvas del pad con:

- `getSettings: () => draftBrushSettings` — l'engine legge dalle settings draft, isolate dal canvas principale.
- `transparentBackground: true`.
- `singleStrokeMode: true` — ogni nuovo tratto resetta il pad.
- `disableNavigation: true` — niente zoom/pan nel pad.
- `documentSizeCap: 2048`.

Ogni cambio slider:
1. Aggiorna `draftBrushSettings`.
2. Chiama `previewEngine.setBrushState(draftBrushSettings)`.
3. Schedula `previewEngine.replayLastStroke()` su rAF (throttled): l'ultimo tratto disegnato viene re-renderizzato in tempo reale con le nuove settings.

Su CONFIRM le draft diventano `window.CBO.brushSettings` globali e il canvas principale riceve l'evento. Su CANCEL le draft sono scartate.

# GAP NOTI

Parametri gia' applicati end-to-end dal motore reale (UI -> brushState -> shader/CPU):

- `radius` (con `size` come fallback legacy)
- `opacity`
- `color`
- `spacing`
- `spacingJitter`
- `jitterLateral`
- `jitterLinear`
- `fallOff`
- `streamLineAmount`
- `streamLinePressure`
- `stabilizationAmount`
- `flow`
- `hardness`
- `minSizeRatio` (default 0.15, non ancora esposto in UI)
- `wetDilution`
- `wetCharge`
- `wetAttack`
- `wetnessJitter`
- `shapeAlphaSrc`
- `shapeRotation`
- `shapeScatter`
- `shapeCount`
- `shapeCountJitter`
- `shapeFlipX`
- `shapeFlipY`
- `grainTextureSrc`
- `grainMode` (`texturized` e `moving` applicati nel motore con rami separati)
- `grainTexturizedScale`
- `grainTexturizedDepth`
- `grainMovingMovement`
- `grainMovingScale`
- `grainMovingZoom`
- `grainMovingRotation`
- `grainMovingDepth`
- `grainMovingDepthMinimum`
- `grainMovingDepthJitter`
- `grainMovingOffsetJitter`
- `grainBlendMode` (`multiply`, `darken`, `linear-burn`, `overlay`, `lighten`, `difference`)
- `grainBrightness`
- `grainContrast`
- `grainInvert`

Parametri senza contratto WebGL completo:

- Blend mode grain avanzati: `color-burn`, `color-dodge`, `hard-mix`, `subtract`, `divide`.
- Modalita' speciali `height` e `linear-height`: da trattare come texture/height modes, non come normali layer blend mode.
- Grain Filtering: per ora non previsto.
- curve/toggle pressione su size, opacity e flow (response curve editabile).
- tilt mapping (azimuth + altitude su forma/orientamento).

# PROSSIMO OBIETTIVO ARCHITETTURALE

Step 6 — Texture brushes (shape + grain) e' ora parzialmente implementato.

Gia' fatto:

- `uShapeTexture` (RGBA upload, alpha campionata, `CLAMP_TO_EDGE`, mipmap `LINEAR_MIPMAP_LINEAR`) per la silhouette del pennello.
- `uGrainTexture` (RGBA grayscale upload, canale `.r` come grain alpha, `REPEAT`, mipmap `LINEAR_MIPMAP_LINEAR`) campionata in document space per Texturized.
- Fallback al cerchietto procedurale finche' la shape texture non e' caricata.
- Cache delle immagini tramite `window.CBO.ImageCache` per evitare ricaricamenti quando si cambia preset.
- Compatibilita' con MAX blending (output sempre pre-moltiplicato).

Prossimi passi consigliati:

- Rifinire visivamente i 6 Grain Blend Mode attuali su Texturized.
- Implementare la seconda ondata di blend mode standard solo dopo tuning (`color-burn`, `color-dodge`, `hard-mix`, `subtract`, `divide`).
- Implementare `height` e `linear-height` come modalita' speciali di texture/height.
- Dopo il grain/shape maturo: pressure curves e tilt mapping.
