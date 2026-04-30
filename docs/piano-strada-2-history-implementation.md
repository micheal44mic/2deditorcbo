# Piano Strada 2: history centrale documento

Questo documento descrive l'implementazione consigliata per spostare undo/redo da `BrushEngine` a una history centrale di documento. E' scritto per una persona che non puo aprire il codice originale: include contesto, obiettivi, API, motivazioni, codice di riferimento, modifiche richieste e test.

## Obiettivo

L'editor oggi ha undo/redo legati al motore brush. Questo funziona per pennello, gomma e in parte smudge, ma non scala bene a testo, layer, rasterizzazione testo, drag del testo, slider, colore e reorder layer.

La soluzione corretta e' introdurre un modulo centrale:

```text
js/document/document-history.js
```

Questo modulo possiede:

- `undoStack`
- `redoStack`
- limite massimo history, consigliato `MAX_HISTORY_ENTRIES = 40`
- `push(entry, options)`
- `undo()`
- `redo()`
- distruzione delle entry vecchie
- listener di toolbar per `cbo:history-action`
- supporto a grouping/coalescing per input continui
- guardia per evitare che un restore generi nuova history

I motori specifici non devono piu possedere la history globale. Devono solo produrre entry complete e consegnarle a:

```js
window.CBO.documentHistory.push(entry, options);
```

## Stato attuale atteso

Nel codice esistente la situazione tipica e':

- `BrushEngine` contiene `undoStack`, `redoStack`, `pushHistoryEntry`, `undoHistory`, `redoHistory`, `clearHistoryStack`, `deleteHistoryEntry`.
- `BrushEngine` ascolta direttamente l'evento `cbo:history-action`.
- `SmudgeEngine` verifica la history cercando `window.CBO.brushEngine.pushHistoryEntry`.
- `toolbar.js` emette gia `cbo:history-action` con `detail.action` uguale a `"undo"` o `"redo"`.
- `DocumentLayerModel` gestisce `entries`, `activeLayerId`, `setEntries`, `setActiveLayer`, `updateLayer`, `ensureActivePaintLayer`.
- Le modifiche testo passano quasi tutte da `DocumentLayerModel.updateLayer()` oppure `DocumentLayerModel.setEntries()`.
- Molti controlli testo generano eventi `input` continui, quindi senza grouping ogni carattere o ogni tick di slider diventa un undo separato.

Questa architettura porta a tre problemi:

1. La toolbar controlla il brush invece del documento.
2. Testo e layer non possono entrare nella history senza dipendere dal brush.
3. Gli input continui creano troppa history se non vengono raggruppati.

## Architettura finale

La relazione tra moduli deve diventare questa:

```text
Toolbar
  emette cbo:history-action
        |
        v
DocumentHistory
  possiede undoStack/redoStack
  applica undo/redo delle entry
        ^
        |
BrushEngine / SmudgeEngine / DocumentLayerModel / Rasterizer testo
  creano entry e chiamano documentHistory.push(...)
```

`DocumentHistory` non deve sapere come funziona WebGL, come si ripristina una texture o come si ridisegna un testo. Deve solo eseguire entry standardizzate. Questo mantiene basso il rischio della migrazione.

## Tipi di entry

Le entry devono essere oggetti con un contratto comune.

### Entry pixel

Usata per brush, gomma e smudge quando si puo salvare una regione raster prima/dopo.

Forma logica:

```js
{
  type: "pixel",
  layerId: "paint-main",
  rect: { x: 10, y: 20, width: 300, height: 180 },
  before: beforeSnapshot,
  after: afterSnapshot,
  source: "brush",
  undo() {
    return brushEngine.restoreHistorySnapshot(this.layerId, this.before);
  },
  redo() {
    return brushEngine.restoreHistorySnapshot(this.layerId, this.after);
  },
  destroy() {
    brushEngine.deleteHistorySnapshot(this.before);
    brushEngine.deleteHistorySnapshot(this.after);
  }
}
```

Nota importante: `before` e `after` devono essere copie immutabili dello stato raster, non riferimenti a texture ancora modificate dal canvas.

### Entry custom

Usata quando non basta una coppia before/after raster oppure quando l'operazione e' speciale.

Forma:

```js
{
  type: "custom",
  source: "smudge",
  undo() {
    return restoreCustomStateBefore();
  },
  redo() {
    return restoreCustomStateAfter();
  },
  destroy() {
    releaseCustomResources();
  }
}
```

`undo()` e `redo()` devono restituire `true` se il restore e' riuscito. Se restituiscono `false`, `DocumentHistory` distrugge l'entry invece di spostarla nell'altro stack.

### Entry layer-state

Usata per testo, creazione layer, cancellazione layer, reorder, rinomina, visibilita, lock, rasterizzazione testo e modifiche dei metadati layer.

Forma:

```js
{
  type: "layer-state",
  beforeEntries: [...],
  afterEntries: [...],
  beforeActiveLayerId: "paint-main",
  afterActiveLayerId: "text-abc",
  source: "vector-text-create",
  historyGroup: "text-create-text-abc",
  undo() {
    return documentHistory.restoreLayerState(layerModel, {
      entries: this.beforeEntries,
      activeLayerId: this.beforeActiveLayerId,
      source: "history-undo-layer-state"
    });
  },
  redo() {
    return documentHistory.restoreLayerState(layerModel, {
      entries: this.afterEntries,
      activeLayerId: this.afterActiveLayerId,
      source: "history-redo-layer-state"
    });
  },
  destroy() {}
}
```

Le snapshot layer devono essere deep clone JSON-like degli entry. Non devono contenere riferimenti vivi a DOM, WebGL texture, framebuffer, path cache o istanze runtime.

## Perche DocumentHistory non deve ripristinare direttamente texture WebGL

Il restore raster oggi dipende da:

- contesto WebGL
- framebuffer del layer target
- coordinate Y invertite tra DOM/documento e WebGL
- shader/composite program
- invalidazione del renderer
- dispatch di `cbo:document-content-change`

Spostare tutto questo subito dentro `DocumentHistory` aumenterebbe il rischio. Nel primo step e' meglio lasciare nel brush i metodi gia funzionanti:

- `createHistorySnapshot(target, rect, label)`
- `restoreHistorySnapshot(layerId, snapshot)`
- `deleteHistorySnapshot(snapshot)`

La centralizzazione deve riguardare stack, lifecycle e listener toolbar. Il dettaglio WebGL resta nel modulo che gia lo conosce.

## Nuovo file: js/document/document-history.js

Questo e' un riferimento completo del modulo consigliato. Alcuni nomi si possono adattare allo stile esistente, ma il comportamento non deve cambiare.

```js
window.CBO = window.CBO || {};

(function registerDocumentHistory(namespace) {
  const DEFAULT_MAX_HISTORY_ENTRIES = 40;
  const DEFAULT_GROUP_IDLE_MS = 700;
  const HISTORY_CHANGE_EVENT = "cbo:history-change";

  function isObject(value) {
    return Boolean(value && typeof value === "object");
  }

  function cloneValue(value) {
    if (Array.isArray(value)) {
      return value.map((item) => cloneValue(item));
    }

    if (isObject(value)) {
      return Object.fromEntries(
        Object.entries(value).map(([key, item]) => [key, cloneValue(item)]),
      );
    }

    return value;
  }

  function statesAreEqual(first, second) {
    return JSON.stringify(first) === JSON.stringify(second);
  }

  class DocumentHistory extends EventTarget {
    constructor(options = {}) {
      super();

      this.maxEntries = Number.isFinite(options.maxEntries) && options.maxEntries > 0
        ? Math.floor(options.maxEntries)
        : DEFAULT_MAX_HISTORY_ENTRIES;
      this.groupIdleMs = Number.isFinite(options.groupIdleMs) && options.groupIdleMs >= 0
        ? Math.floor(options.groupIdleMs)
        : DEFAULT_GROUP_IDLE_MS;
      this.undoStack = [];
      this.redoStack = [];
      this.activeGroups = new Set();
      this.isRestoring = false;
      this.isDisposed = false;
      this.pendingLayerStates = new WeakMap();
      this.handleHistoryAction = this.handleHistoryAction.bind(this);

      window.addEventListener("cbo:history-action", this.handleHistoryAction);
    }

    handleHistoryAction(event) {
      const action = String(event.detail?.action || "").toLowerCase();

      if (action === "undo") {
        this.undo();
      } else if (action === "redo") {
        this.redo();
      }
    }

    beginGroup(groupId) {
      const key = String(groupId || "").trim();

      if (key) {
        this.activeGroups.add(key);
      }
    }

    endGroup(groupId) {
      const key = String(groupId || "").trim();

      if (key) {
        this.activeGroups.delete(key);
      }
    }

    runWithoutRecording(callback) {
      if (typeof callback !== "function") {
        return undefined;
      }

      this.isRestoring = true;

      try {
        return callback();
      } finally {
        this.isRestoring = false;
      }
    }

    canRecord(options = {}) {
      if (this.isDisposed || this.isRestoring) {
        return false;
      }

      if (options.recordHistory === false || options.history === false) {
        return false;
      }

      return true;
    }

    normalizeEntry(entry, options = {}) {
      if (!isObject(entry)) {
        return null;
      }

      const undo = entry.undo;
      const redo = entry.redo;

      if (typeof undo !== "function" || typeof redo !== "function") {
        return null;
      }

      const now = Date.now();
      const historyGroup = String(options.historyGroup || entry.historyGroup || "").trim();

      return {
        ...entry,
        historyGroup,
        source: entry.source || options.source || "document-history",
        type: entry.type || "custom",
        updatedAt: now,
      };
    }

    destroyEntry(entry) {
      if (!entry || entry.destroyed === true) {
        return;
      }

      entry.destroyed = true;

      if (typeof entry.destroy === "function") {
        entry.destroy();
      }
    }

    clearStack(stack) {
      while (stack.length > 0) {
        this.destroyEntry(stack.pop());
      }
    }

    clear() {
      this.clearStack(this.undoStack);
      this.clearStack(this.redoStack);
      this.emitChange("clear");
    }

    shouldMergeEntries(previousEntry, nextEntry) {
      if (!previousEntry || !nextEntry) {
        return false;
      }

      if (!previousEntry.historyGroup || previousEntry.historyGroup !== nextEntry.historyGroup) {
        return false;
      }

      if (previousEntry.type !== nextEntry.type) {
        return false;
      }

      if (typeof previousEntry.mergeWith !== "function") {
        return false;
      }

      if (this.activeGroups.has(nextEntry.historyGroup)) {
        return true;
      }

      const previousUpdatedAt = Number.isFinite(previousEntry.updatedAt) ? previousEntry.updatedAt : 0;
      const nextUpdatedAt = Number.isFinite(nextEntry.updatedAt) ? nextEntry.updatedAt : Date.now();

      return nextUpdatedAt - previousUpdatedAt <= this.groupIdleMs;
    }

    push(entry, options = {}) {
      if (!this.canRecord(options)) {
        this.destroyEntry(entry);
        return false;
      }

      const nextEntry = this.normalizeEntry(entry, options);

      if (!nextEntry) {
        this.destroyEntry(entry);
        return false;
      }

      const previousEntry = this.undoStack[this.undoStack.length - 1];

      if (this.shouldMergeEntries(previousEntry, nextEntry)) {
        const didMerge = previousEntry.mergeWith(nextEntry) !== false;

        if (didMerge) {
          previousEntry.updatedAt = nextEntry.updatedAt;
          this.destroyEntry(nextEntry);
          this.clearStack(this.redoStack);
          this.emitChange("merge");
          return true;
        }
      }

      this.undoStack.push(nextEntry);
      this.clearStack(this.redoStack);

      while (this.undoStack.length > this.maxEntries) {
        this.destroyEntry(this.undoStack.shift());
      }

      this.emitChange("push");
      return true;
    }

    undo() {
      const entry = this.undoStack.pop();

      if (!entry) {
        this.emitChange("undo-empty");
        return false;
      }

      const didUndo = this.runWithoutRecording(() => entry.undo() !== false);

      if (didUndo) {
        this.redoStack.push(entry);
      } else {
        this.destroyEntry(entry);
      }

      this.emitChange("undo");
      return didUndo;
    }

    redo() {
      const entry = this.redoStack.pop();

      if (!entry) {
        this.emitChange("redo-empty");
        return false;
      }

      const didRedo = this.runWithoutRecording(() => entry.redo() !== false);

      if (didRedo) {
        this.undoStack.push(entry);
      } else {
        this.destroyEntry(entry);
      }

      this.emitChange("redo");
      return didRedo;
    }

    emitChange(source) {
      const detail = {
        canRedo: this.redoStack.length > 0,
        canUndo: this.undoStack.length > 0,
        redoCount: this.redoStack.length,
        source,
        undoCount: this.undoStack.length,
      };

      this.dispatchEvent(new CustomEvent("change", { detail }));
      window.dispatchEvent(new CustomEvent(HISTORY_CHANGE_EVENT, { detail }));
    }

    getLayerSnapshot(layerModel) {
      if (!layerModel || typeof layerModel.getEntries !== "function") {
        return null;
      }

      return {
        activeLayerId: layerModel.activeLayerId || null,
        entries: layerModel.getEntries(),
      };
    }

    restoreLayerState(layerModel, state, options = {}) {
      if (!layerModel || !Array.isArray(state?.entries)) {
        return false;
      }

      this.runWithoutRecording(() => {
        layerModel.setEntries(cloneValue(state.entries), {
          history: false,
          source: options.source || "history-layer-restore",
        });
        layerModel.setActiveLayer(state.activeLayerId || null, {
          history: false,
          source: options.source || "history-layer-restore",
        });
      });

      return true;
    }

    createLayerStateEntry(layerModel, beforeState, afterState, options = {}) {
      if (!beforeState || !afterState || statesAreEqual(beforeState, afterState)) {
        return null;
      }

      const before = cloneValue(beforeState);
      const after = cloneValue(afterState);
      const history = this;

      return {
        type: "layer-state",
        beforeEntries: before.entries,
        afterEntries: after.entries,
        beforeActiveLayerId: before.activeLayerId,
        afterActiveLayerId: after.activeLayerId,
        historyGroup: options.historyGroup || "",
        source: options.source || "layer-state",
        undo() {
          return history.restoreLayerState(layerModel, before, {
            source: "history-undo-layer-state",
          });
        },
        redo() {
          return history.restoreLayerState(layerModel, after, {
            source: "history-redo-layer-state",
          });
        },
        mergeWith(nextEntry) {
          if (nextEntry?.type !== "layer-state") {
            return false;
          }

          this.afterEntries = cloneValue(nextEntry.afterEntries);
          this.afterActiveLayerId = nextEntry.afterActiveLayerId || null;
          this.redo = nextEntry.redo;
          return true;
        },
        destroy() {},
      };
    }

    recordLayerStateChange(layerModel, beforeState, options = {}) {
      if (!this.canRecord(options) || !beforeState) {
        return;
      }

      const previousPending = this.pendingLayerStates.get(layerModel);
      const pending = previousPending || {
        beforeState: cloneValue(beforeState),
        options: { ...options },
        scheduled: false,
      };

      pending.options = {
        ...pending.options,
        ...options,
        historyGroup: options.historyGroup || pending.options.historyGroup || "",
        source: options.source || pending.options.source || "layer-state",
      };

      if (!pending.scheduled) {
        pending.scheduled = true;
        queueMicrotask(() => {
          this.flushLayerState(layerModel);
        });
      }

      this.pendingLayerStates.set(layerModel, pending);
    }

    flushLayerState(layerModel) {
      const pending = this.pendingLayerStates.get(layerModel);

      if (!pending) {
        return false;
      }

      this.pendingLayerStates.delete(layerModel);

      if (!this.canRecord(pending.options)) {
        return false;
      }

      const afterState = this.getLayerSnapshot(layerModel);
      const entry = this.createLayerStateEntry(
        layerModel,
        pending.beforeState,
        afterState,
        pending.options,
      );

      if (!entry) {
        return false;
      }

      return this.push(entry, pending.options);
    }

    dispose() {
      if (this.isDisposed) {
        return;
      }

      this.isDisposed = true;
      window.removeEventListener("cbo:history-action", this.handleHistoryAction);
      this.clear();
      this.activeGroups.clear();
      this.pendingLayerStates = new WeakMap();
    }
  }

  namespace.DocumentHistory = DocumentHistory;
})(window.CBO = window.CBO || {});
```

## index.html

Caricare `document-history.js` prima dei moduli che possono usarlo.

Ordine consigliato:

```html
<script src="./js/document/document-layer-model.js"></script>
<script src="./js/document/document-history.js"></script>
<script src="./js/text/vector-text-engine.js"></script>
```

Il file deve essere disponibile prima di `editor-canvas.js`, `brush-engine.js`, `smudge-engine.js`, `vector-text-renderer.js` e `right-sidebar.js`.

## Inizializzazione

Nel bootstrap del canvas/documento bisogna creare o ricreare la history centrale. Il punto consigliato e' dove vengono creati `DocumentLayerModel`, `DocumentRenderer`, `BrushEngine` e `SmudgeEngine`.

Flusso consigliato:

```js
window.CBO.documentHistory?.dispose?.();
window.CBO.documentHistory = new window.CBO.DocumentHistory({
  maxEntries: 40,
});
```

Questo deve avvenire una sola volta per documento attivo. Se il canvas viene reinizializzato, la vecchia history va distrutta per liberare texture, framebuffer e riferimenti a layer vecchi.

## Migrazione BrushEngine

### Rimuovere responsabilita history globale

Da `BrushEngine` vanno rimossi:

- `this.undoStack = []`
- `this.redoStack = []`
- `bindHistoryEvents()`
- listener `cbo:history-action`
- `handleHistoryAction`
- `pushHistoryEntry`
- `undoHistory`
- `redoHistory`
- `clearHistoryStack`
- `deleteHistoryEntry`

Si possono lasciare nel brush, almeno nel primo step:

- `createHistorySnapshot`
- `restoreHistorySnapshot`
- `deleteHistorySnapshot`

Questi metodi conoscono WebGL e sono gia nel posto giusto.

### Push brush/gomma

Dove oggi il brush crea `beforeSnapshot` e `afterSnapshot`, deve costruire una entry pixel completa.

Schema consigliato:

```js
const history = namespace.documentHistory;

if (history && beforeSnapshot && afterSnapshot) {
  history.push({
    type: "pixel",
    after: afterSnapshot,
    before: beforeSnapshot,
    layerId,
    rect: beforeSnapshot.rect,
    source: this.currentStrokeTool,
    undo: () => this.restoreHistorySnapshot(layerId, beforeSnapshot),
    redo: () => this.restoreHistorySnapshot(layerId, afterSnapshot),
    destroy: () => {
      this.deleteHistorySnapshot(beforeSnapshot);
      this.deleteHistorySnapshot(afterSnapshot);
    },
  });
}
```

Se `documentHistory` non esiste o se `push()` rifiuta l'entry, `DocumentHistory` chiamera `destroy()` e quindi liberera le texture. Questo evita leak.

### Opzione enableHistory

Se `BrushEngine` ha una opzione `enableHistory`, si puo mantenerla come guardia locale:

```js
const shouldRecordHistory = this.options.enableHistory !== false && namespace.documentHistory;
```

Pero lo stack non deve piu stare nel brush.

### Dispose brush

Il `dispose()` del brush non deve piu pulire undo/redo globali. Deve solo liberare risorse proprie. La history centrale viene distrutta dal documento o dal bootstrap quando si cambia documento.

Attenzione: se le entry pixel usano `destroy()` che chiama `brushEngine.deleteHistorySnapshot`, allora il brush non deve sparire prima della history senza che la history venga svuotata. Per questo, quando si reinizializza il canvas, l'ordine sicuro e':

1. `documentHistory.dispose()`
2. `smudgeEngine.dispose()`
3. `brushEngine.dispose()`
4. `documentRenderer.dispose()`

In alternativa, `destroy()` delle entry pixel puo catturare solo `gl` e cancellare direttamente texture/framebuffer, ma tenere il cleanup nel brush e' piu semplice.

## Migrazione SmudgeEngine

Smudge non deve piu chiedere se esiste `brushEngine.pushHistoryEntry`.

Prima:

```js
return typeof namespace.brushEngine?.pushHistoryEntry === "function";
```

Dopo:

```js
return typeof namespace.documentHistory?.push === "function";
```

Quando smudge produce una coppia before/after raster:

```js
namespace.documentHistory.push({
  type: "pixel",
  after,
  before,
  layerId,
  rect: before.rect,
  source: "smudge",
  undo: () => this.restoreHistorySnapshot(target, before),
  redo: () => this.restoreHistorySnapshot(target, after),
  destroy: () => {
    this.deleteHistorySnapshot(before);
    this.deleteHistorySnapshot(after);
  },
});
```

Quando smudge usa dabs multipli custom:

```js
namespace.documentHistory.push({
  type: "custom",
  dabs,
  layerId,
  source: "smudge",
  destroy: () => {
    this.deleteHistoryDabs(dabs);
  },
  redo: () => this.restoreHistoryDabs(layerId, dabs, "after", false, "smudge-redo"),
  undo: () => this.restoreHistoryDabs(layerId, dabs, "before", true, "smudge-undo"),
});
```

Se possibile, preferire `type: "pixel"` anche per smudge. `custom` deve restare per casi dove la sequenza di restore e' davvero speciale.

## History per DocumentLayerModel

Il modello layer e' il punto giusto per intercettare testo/layer, perche le modifiche passano gia da li.

Metodi da coprire:

- `setEntries(entries, options)`
- `updateLayer(id, patch, options)`
- `ensureActivePaintLayer(options)`
- `setActiveLayer(id, options)`, ma solo quando fa parte di una mutazione strutturale o quando l'opzione chiede esplicitamente history

### Perche serve batching a microtask

Molte operazioni sono fatte in due chiamate consecutive:

```js
layerModel.setEntries(entries, { source: "vector-text-create" });
layerModel.setActiveLayer(layer.id, { source: "vector-text-create" });
```

Se `setEntries()` pusha subito una entry, l'`afterActiveLayerId` resta quello vecchio. La history non ripristinera correttamente il layer attivo dopo redo.

Soluzione: `DocumentLayerModel` cattura lo stato before prima della prima mutazione e chiede a `DocumentHistory` di flushare la entry a fine microtask. Cosi tutte le mutazioni sincrone dello stesso gesto diventano una sola `layer-state`.

### Helper minimi da aggiungere a DocumentLayerModel

Nel model aggiungere metodi piccoli:

```js
captureHistoryState(options = {}) {
  const history = window.CBO?.documentHistory;

  if (!history?.canRecord?.(options)) {
    return null;
  }

  return history.getLayerSnapshot(this);
}

recordHistoryStateChange(beforeState, options = {}) {
  const history = window.CBO?.documentHistory;

  if (!beforeState || !history?.recordLayerStateChange) {
    return;
  }

  history.recordLayerStateChange(this, beforeState, options);
}
```

Poi usarli nei metodi mutanti:

```js
setEntries(entries, options = {}) {
  const beforeState = this.captureHistoryState(options);

  this.entries = this.ensureSystemLayers(this.normalizeEntries(entries));

  if (!this.canActivateEntry(this.findEntryById(this.activeLayerId))) {
    this.activeLayerId = this.findFirstLayer(this.entries)?.id || null;
  }

  this.emitChange(options.source || "set-entries");
  this.recordHistoryStateChange(beforeState, options);
}
```

Per `updateLayer`:

```js
updateLayer(id, patch, options = {}) {
  const entry = this.findEntryById(id);

  if (!entry || entry.type === "group") {
    return false;
  }

  const nextPatch = typeof patch === "function" ? patch(this.cloneEntry(entry)) : patch;

  if (!nextPatch || typeof nextPatch !== "object") {
    return false;
  }

  const beforeState = this.captureHistoryState(options);

  Object.assign(entry, this.cloneValue(nextPatch));
  entry.opacity = Number.isFinite(entry.opacity) ? Math.min(1, Math.max(0, entry.opacity)) : 1;

  this.emitChange(options.source || "update-layer");
  this.recordHistoryStateChange(beforeState, options);

  return true;
}
```

Per `setActiveLayer`, non registrare sempre. Se ogni click su layer diventasse undo, l'esperienza sarebbe pessima. Registrare solo se richiesto:

```js
setActiveLayer(id, options = {}) {
  const shouldRecord = options.recordActiveLayerHistory === true;
  const beforeState = shouldRecord ? this.captureHistoryState(options) : null;
  const entry = this.findEntryById(id);

  this.activeLayerId = this.canActivateEntry(entry) ? entry.id : null;
  this.emitChange(options.source || "active-layer");
  this.recordHistoryStateChange(beforeState, options);
}
```

Quando `setActiveLayer()` segue subito `setEntries()` nella stessa microtask, non serve `recordActiveLayerHistory`: il pending layer-state gia aperto da `setEntries()` includera l'active finale.

## Grouping input continui

Il requisito e': 100 eventi di digitazione, slider o drag devono diventare un solo undo.

Il meccanismo consigliato ha due livelli:

1. `historyGroup` sulle entry.
2. Merge delle entry consecutive con stesso gruppo.

Per `layer-state`, il merge deve mantenere il `before` della prima entry e sostituire solo l'`after` con quello piu recente.

Esempio:

```text
Input 1: before = testo "A", after = "AB"
Input 2: before = testo "AB", after = "ABC"
Input 3: before = testo "ABC", after = "ABCD"

Entry finale:
before = "A"
after = "ABCD"
```

### Naming dei gruppi

Usare chiavi stabili e specifiche:

```js
`text-content-${layer.id}`
`text-font-size-${layer.id}`
`text-fill-color-${layer.id}`
`text-stroke-color-${layer.id}`
`text-shadow-depth-${layer.id}`
`text-transform-amount-${layer.id}`
`text-drag-${layer.id}`
`text-envelope-${layer.id}-${nodeId}`
```

Non usare una sola chiave generica tipo `text-edit`, altrimenti modifiche diverse possono fondersi in un unico undo troppo grande.

### Right sidebar testo

La funzione centrale di patch deve accettare opzioni history:

```js
function patchActiveTextLayer(patch, source = "text-sidebar", historyOptions = {}) {
  if (isSyncingTextLayerControls) {
    return;
  }

  const layerModel = getLayerModel();
  const layer = getActiveTextLayer();

  if (!layer || !layerModel?.updateLayer) {
    return;
  }

  layerModel.updateLayer(layer.id, mergeTextLayerPatch(layer, patch), {
    source,
    historyGroup: historyOptions.historyGroup || "",
  });
}
```

Esempio input testo:

```js
textContentInput?.addEventListener("input", () => {
  const layer = getActiveTextLayer();

  patchActiveTextLayer(
    { text: textContentInput.value },
    "text-sidebar-content",
    { historyGroup: layer ? `text-content-${layer.id}` : "" },
  );
});
```

Esempio slider font size:

```js
textFontSizeInput?.addEventListener("input", () => {
  const layer = getActiveTextLayer();

  patchActiveTextLayer(
    { fontSize: clamp(textFontSizeInput.value, 1, 999) },
    "text-sidebar-font-size",
    { historyGroup: layer ? `text-font-size-${layer.id}` : "" },
  );
});
```

Per input che hanno focus/blur, e' utile aprire e chiudere esplicitamente il gruppo:

```js
function bindContinuousHistoryGroup(input, getGroupId) {
  input.addEventListener("focus", () => {
    const groupId = getGroupId();

    if (groupId) {
      window.CBO.documentHistory?.beginGroup(groupId);
    }
  });

  input.addEventListener("blur", () => {
    const groupId = getGroupId();

    if (groupId) {
      window.CBO.documentHistory?.endGroup(groupId);
    }
  });
}
```

Questa funzione non sostituisce `historyGroup` nelle patch. Serve solo a dire alla history che il gruppo e' ancora aperto anche se tra due input passa piu tempo.

### Drag testo

Per il drag del testo conviene registrare una sola entry alla fine del drag, non a ogni movimento. Se oggi il movimento aggiorna solo il DOM/SVG preview e chiama `updateLayer()` su pointerup, e' gia quasi perfetto.

Su pointerup:

```js
this.layerModel.updateLayer(layerId, {
  x: nextLayer.x,
  y: nextLayer.y,
}, {
  source: "vector-text-drag",
  historyGroup: `text-drag-${layerId}`,
});
```

### Envelope drag

Se il drag envelope chiama `updateLayer()` a ogni pointermove, bisogna passare sempre lo stesso gruppo mentre il pointer e' premuto:

```js
const historyGroup = `text-envelope-${this.envelopeDragState.layerId}-${this.envelopeDragState.nodeId}`;

this.layerModel.updateLayer(layer.id, { envelopeGrid }, {
  source: "vector-text-envelope-drag",
  historyGroup,
});
```

Su pointerdown:

```js
window.CBO.documentHistory?.beginGroup(historyGroup);
```

Su pointerup/cancel:

```js
window.CBO.documentHistory?.endGroup(historyGroup);
```

## Rasterizzazione testo

Quando un layer testo viene rasterizzato, la parte layer model e' coperta da `layer-state` perche sostituisce l'entry testo con un entry paint.

Ma c'e' un secondo aspetto: il contenuto raster del nuovo layer paint viene scritto in una texture. Se l'undo ripristina il layer testo, il layer paint sparisce dal model, ma la texture raster puo restare nella mappa del renderer se non viene pulita.

Soluzione consigliata per il primo step:

- `layer-state` gestisce correttamente il model.
- Il renderer deve tollerare target raster orfani e ignorarli se non sono piu in `getRenderableLayers()`.
- Una pulizia periodica dei raster target orfani puo essere aggiunta dopo ogni `document-layers-change`, ma non e' obbligatoria per la correttezza visiva.

Soluzione migliore a regime:

- Quando `DocumentLayerModel` emette un cambio entries, `DocumentRenderer` confronta i layer raster esistenti con gli id ancora presenti nel model.
- Elimina i raster target non piu presenti, esclusi `background` e il paint principale.
- Questa pulizia deve essere sospesa durante una operazione in cui un undo puo riportare subito il layer, oppure deve essere accettato che redo ricrei il target vuoto e la rasterizzazione venga rifatta.

Se si vuole che undo/redo della rasterizzazione conservi anche il contenuto pixel del paint layer generato, serve una entry custom piu ricca che include:

- layer-state before/after
- snapshot raster del layer paint creato
- restore layer model
- restore texture del nuovo paint layer in redo

Questa parte puo essere una fase successiva. Per testo vettoriale, spesso basta ripristinare il layer vettoriale.

## Gestione cancellazione layer e pixel history

Caso delicato:

1. Disegno su layer A.
2. Cancello layer A.
3. Undo deve prima ripristinare layer A.
4. Undo successivo deve ripristinare il tratto pixel precedente.

In una history lineare funziona se anche la cancellazione layer e' una entry nello stesso stack. Serve comunque rendere sicure le pixel entry:

```js
undo() {
  if (!documentRenderer.layerModel.findEntryById(layerId)) {
    return false;
  }

  return brushEngine.restoreHistorySnapshot(layerId, beforeSnapshot);
}
```

Se il layer non esiste, l'entry restituisce `false` e `DocumentHistory` la distrugge. Questo evita errori quando la history viene corrotta da operazioni esterne o da reset documento.

## Toolbar

`toolbar.js` puo restare quasi invariato.

Comportamento giusto:

```js
window.dispatchEvent(
  new CustomEvent("cbo:history-action", {
    detail: { action },
  }),
);
```

Il listener deve stare solo in `DocumentHistory`. `BrushEngine` non deve piu ascoltare questo evento.

Opzionale: i bottoni undo/redo possono ascoltare `cbo:history-change` per abilitarsi/disabilitarsi.

```js
window.addEventListener("cbo:history-change", (event) => {
  undoButton.disabled = !event.detail.canUndo;
  redoButton.disabled = !event.detail.canRedo;
});
```

## Ordine di implementazione

L'ordine migliore riduce il rischio.

### Fase 1: history centrale senza cambiare comportamento

1. Creare `js/document/document-history.js`.
2. Aggiungere lo script in `index.html`.
3. Inizializzare `window.CBO.documentHistory`.
4. Spostare listener `cbo:history-action` in `DocumentHistory`.
5. Migrare brush/gomma a `documentHistory.push(pixelEntry)`.
6. Migrare smudge a `documentHistory.push(pixelEntry/customEntry)`.
7. Rimuovere stack e undo/redo da `BrushEngine`.
8. Verificare brush, gomma, smudge undo/redo.

Questa fase deve essere a comportamento identico per raster tools.

### Fase 2: layer-state

1. Aggiungere snapshot before/after in `DocumentLayerModel`.
2. Usare batching a microtask per unire `setEntries` + `setActiveLayer`.
3. Creare entry `layer-state` tramite `DocumentHistory`.
4. Proteggere restore con `history: false` e `runWithoutRecording`.
5. Verificare create/delete/reorder/rename/visibility/lock.

### Fase 3: testo

1. Passare `historyGroup` dai controlli testo continui.
2. Passare `historyGroup` per drag testo.
3. Passare `historyGroup` per envelope drag.
4. Verificare typing, slider, colori, warp, shadow, drag.

### Fase 4: pulizia e UI state

1. Aggiungere `cbo:history-change`.
2. Disabilitare bottoni undo/redo quando stack vuoti.
3. Valutare pruning raster target orfani.
4. Aggiungere test piu completi.

## Test unitari consigliati

Creare un file dedicato, ad esempio:

```text
tests/document-history.test.js
```

Casi minimi:

1. `push()` accetta entry valida e incrementa undo stack.
2. `push()` rifiuta entry invalida e chiama `destroy()`.
3. `push()` cancella redo stack dopo una nuova azione.
4. Limite `maxEntries` distrugge l'entry piu vecchia.
5. `undo()` chiama `entry.undo()` e sposta entry in redo stack.
6. `redo()` chiama `entry.redo()` e sposta entry in undo stack.
7. Se `undo()` restituisce `false`, l'entry viene distrutta.
8. Due `layer-state` con stesso `historyGroup` vengono mergeate.
9. Il merge mantiene `beforeEntries` della prima entry e `afterEntries` dell'ultima.
10. `runWithoutRecording()` impedisce push durante restore.

Esempio test Node:

```js
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const repoRoot = path.resolve(__dirname, "..");

function loadDocumentHistory() {
  const source = fs.readFileSync(
    path.join(repoRoot, "js", "document", "document-history.js"),
    "utf8",
  );
  const listeners = new Map();
  const window = {
    CBO: {},
    addEventListener(type, listener) {
      listeners.set(type, listener);
    },
    removeEventListener(type) {
      listeners.delete(type);
    },
    dispatchEvent() {},
  };
  const context = vm.createContext({
    CustomEvent: class CustomEvent {
      constructor(type, init = {}) {
        this.type = type;
        this.detail = init.detail;
      }
    },
    Date,
    EventTarget,
    JSON,
    Map,
    Number,
    Object,
    Set,
    String,
    WeakMap,
    queueMicrotask,
    window,
  });

  vm.runInContext(source, context);

  return context.window.CBO.DocumentHistory;
}

test("DocumentHistory pushes, undoes and redoes a valid entry", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory({ maxEntries: 40 });
  const calls = [];

  history.push({
    type: "custom",
    undo() {
      calls.push("undo");
      return true;
    },
    redo() {
      calls.push("redo");
      return true;
    },
    destroy() {
      calls.push("destroy");
    },
  });

  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);

  assert.equal(history.undo(), true);
  assert.deepEqual(calls, ["undo"]);
  assert.equal(history.undoStack.length, 0);
  assert.equal(history.redoStack.length, 1);

  assert.equal(history.redo(), true);
  assert.deepEqual(calls, ["undo", "redo"]);
  assert.equal(history.undoStack.length, 1);
  assert.equal(history.redoStack.length, 0);
});

test("DocumentHistory destroys entries removed by maxEntries", () => {
  const DocumentHistory = loadDocumentHistory();
  const history = new DocumentHistory({ maxEntries: 2 });
  const destroyed = [];

  for (let index = 1; index <= 3; index += 1) {
    history.push({
      type: "custom",
      id: index,
      undo() {
        return true;
      },
      redo() {
        return true;
      },
      destroy() {
        destroyed.push(index);
      },
    });
  }

  assert.deepEqual(destroyed, [1]);
  assert.equal(history.undoStack.length, 2);
});
```

## Test manuali obbligatori

Dopo l'implementazione provare questi flussi in browser:

1. Disegnare con brush, undo, redo.
2. Usare gomma, undo, redo.
3. Usare smudge, undo, redo.
4. Disegnare su layer nuovo, cancellare layer, undo cancellazione, undo tratto.
5. Creare testo, undo, redo.
6. Scrivere 10 caratteri nel testo: un solo undo deve tornare al testo precedente.
7. Muovere slider font size per vari secondi: un solo undo deve tornare alla dimensione iniziale del gesto.
8. Cambiare colore testo con color input: non deve creare decine di undo inutili.
9. Drag testo: un solo undo deve tornare alla posizione iniziale.
10. Envelope drag: un solo undo deve tornare alla forma iniziale.
11. Reorder layer: undo/redo deve ripristinare ordine e layer attivo.
12. Rasterizzare testo: undo deve ripristinare il layer testo o comunque non lasciare il documento in stato incoerente.

## Edge case da gestire

### Entry invalida

Se una entry non ha `undo()` e `redo()`, `DocumentHistory.push()` deve rifiutarla e chiamare `destroy()`.

### Restore fallito

Se `undo()` o `redo()` restituisce `false`, l'entry deve essere distrutta. Non deve restare in nessuno stack.

### Nuova azione dopo undo

Se l'utente fa undo e poi disegna o modifica testo, tutto il redo stack deve essere distrutto.

### Reset documento

Quando si resetta/reinizializza il documento, chiamare `documentHistory.dispose()` o `documentHistory.clear()` prima di distruggere WebGL.

### Doppia distruzione

Ogni entry deve avere protezione contro double destroy. `DocumentHistory.destroyEntry()` puo impostare `entry.destroyed = true`.

### Mutazioni causate da undo

Durante `undo()` e `redo()`, `DocumentLayerModel` non deve registrare nuove entry. Usare:

```js
documentHistory.runWithoutRecording(() => {
  layerModel.setEntries(entries, { history: false, source: "history-restore" });
});
```

### Snapshot layer senza riferimenti vivi

Le snapshot layer devono essere serializzabili. Se un layer contiene cache, DOM node, texture o oggetti runtime, quei campi non devono entrare in `entries`.

## Decisioni chiave

### Tenere snapshot WebGL nel brush per ora

Motivo: e' la scelta piu sicura. Il brush conosce gia il contesto WebGL e i dettagli di restore. `DocumentHistory` deve orchestrare, non diventare un renderer.

### Usare entry con funzioni undo/redo

Motivo: rende uniforme pixel, custom e layer-state. La history centrale non deve avere switch complessi per ogni dominio.

### Usare batching microtask per layer-state

Motivo: molte operazioni layer sono composte da piu chiamate sincrone. Il batching cattura lo stato finale corretto senza costringere a riscrivere tutti i chiamanti.

### Non rendere ogni selezione layer undoable

Motivo: l'utente si aspetta che undo modifichi il documento, non che torni alla selezione precedente dopo ogni click.

### Grouping con chiavi specifiche

Motivo: evita sia history troppo frammentata sia undo troppo grandi.

## Risultato atteso

Dopo l'implementazione:

- Undo/redo e' una responsabilita del documento.
- Brush e gomma continuano a funzionare come prima.
- Smudge non dipende piu dal brush.
- Testo e layer entrano nella stessa timeline di undo/redo.
- Gli input continui sono raggruppati.
- Le vecchie entry vengono distrutte in modo sicuro.
- La toolbar parla con `DocumentHistory`, non con uno strumento specifico.

Questa e' la base corretta per estendere in futuro history a trasformazioni canvas, import immagini, clear layer, resize documento e operazioni multi-layer.
