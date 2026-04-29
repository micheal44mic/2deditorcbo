# Vector Text Compositing

## Goal

Vector text layers must obey the same layer stack as brush, paint, image, and background layers. A text layer placed below an image or brush layer is visually covered by that layer; a text layer placed above remains visible.

## Architecture

Text remains a `vector-text` layer in `DocumentLayerModel`. The editable source data is preserved:

- text content
- font URL and typography settings
- fill, stroke, shadow, and stroke alignment
- warp and envelope grid
- transform values

The visible document no longer relies on the SVG overlay as the final text paint. `VectorTextRenderer` renders each visible text layer into an SVG image, uploads that image into a WebGL raster target with the same layer id, and lets `DocumentRenderer` composite it in `getRenderableLayers()` order.

The SVG overlay still exists for interaction:

- hit testing text paths while the text tool is active
- drag selection and movement
- envelope handles and guides
- keyboard duplication

Its paint and solid shadow groups are transparent in `css/layout.css`, so the overlay cannot force text above the document stack.

## Cache Rules

`VectorTextRenderer` keeps a per-layer raster cache signature. A new texture is generated when any visual source changes:

- document texture size
- path data
- position, scale, or rotation
- fill, stroke, shadow style, and shadow mode
- shadow angle or distance

Opacity is intentionally applied by `DocumentRenderer` at composite time, so opacity changes do not require regenerating the text texture. Visibility and group visibility are handled by the renderable layer stack; stale text targets are deleted when a text layer is hidden, removed, or moved into a hidden group.

Active text layers use a short debounce before rebuilding their WebGL texture. Dragging and slider changes update the SVG interaction overlay immediately, then commit a new compositor texture after the input settles. This avoids re-decoding and re-uploading a full document-sized text texture on every pointer move while keeping the final document stack correct.

Solid 3D shadows are rendered as a continuous extrusion, not as repeated stamped text copies. The renderer builds native line/quadratic/cubic side faces from the text outline and adds a single back face at the requested depth, which keeps diagonal shadow sides straight instead of stair-stepped. The extrusion cache is keyed by path and offset, so pan and zoom do not rebuild Bezier geometry. Internal faces are painted fully opaque and the requested shadow opacity is applied once on the parent group, avoiding striped overlap seams.

## Implementation Contract

New layer types should follow the same contract:

1. Keep semantic/editable source data in `DocumentLayerModel`.
2. Write visual pixels into a WebGL target keyed by the same layer id.
3. Let `DocumentRenderer.drawToCanvas()` be the only final document compositor.
4. Keep DOM/SVG overlays for interaction only, not final paint.

## QA Checklist

Run:

```powershell
node --test tests\vector-text-compositing.test.js
```

Manual checks:

- Place text below an image layer: the image covers the text.
- Move the same text above the image layer: the text appears above it.
- Draw brush strokes on a paint layer above text: strokes cover the text.
- Move that paint layer below text: text appears above the strokes.
- Toggle text visibility and parent group visibility: hidden text leaves no stale pixels.
- Change opacity: the composited opacity updates without changing editability.
- Drag active text and scrub shadow/border sliders: the overlay previews immediately and the final WebGL texture catches up after the interaction settles.
- Enable Solid 3D and increase shadow depth: diagonal sides should read as a continuous filled extrusion, not as stacked copy steps, stripes, or transparent holes.
