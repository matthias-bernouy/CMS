import { type BrowserScenario } from "./types";

/**
 * Reads the listener tallies collected by the init-script installed before
 * navigation (see run.ts → installListenerTracker). Big jumps mean leaked handlers.
 */
async function _listenerScan() {
    const tracker = (window as any).__perfListeners;
    if (!tracker) return { listenersTotal: -1, listenersWindow: -1, listenersDocument: -1 };
    const byType = tracker.byType();
    const topTypes = Object.entries(byType).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
    const out: Record<string, number> = {
        listenersTotal: tracker.total(),
        listenersWindow: tracker.onWindow(),
        listenersDocument: tracker.onDocument(),
        listenersDistinctTypes: Object.keys(byType).length,
    };
    for (const [t, n] of topTypes) out["listeners_" + t] = n as number;
    return out;
}

/**
 * Measures how many listeners are attached per element as the editor
 * editorizes new nodes. Baseline → add 200 <p> → wait → diff.
 */
async function _listenerGrowth() {
    const tracker = (window as any).__perfListeners;
    if (!tracker) return { growthBefore: -1, growthAfter: -1, growthDelta: -1, growthPerElement: -1 };
    const main = document.querySelector("main")!;
    const now = () => performance.now();

    await new Promise(r => setTimeout(r, 200));
    const before = tracker.total();
    const byTypeBefore = tracker.byType();

    const frag = document.createDocumentFragment();
    for (let i = 0; i < 200; i++) {
        const p = document.createElement("p");
        p.className = "__perf_growth__";
        p.textContent = "growth " + i;
        frag.appendChild(p);
    }
    const t0 = now();
    main.appendChild(frag);

    const deadline = t0 + 5000;
    while (now() < deadline) {
        const done = main.querySelectorAll("p.__perf_growth__[p9r-is-editor]").length;
        if (done >= 200) break;
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 200));

    const after = tracker.total();
    const byTypeAfter = tracker.byType();
    const delta = after - before;

    const diffs: Record<string, number> = {};
    const keys = new Set([...Object.keys(byTypeBefore), ...Object.keys(byTypeAfter)]);
    for (const k of keys) {
        const d = (byTypeAfter[k] || 0) - (byTypeBefore[k] || 0);
        if (d !== 0) diffs[k] = d;
    }
    const top = Object.entries(diffs).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);

    const out: Record<string, number> = {
        growthBefore: before,
        growthAfter: after,
        growthDelta: delta,
        growthPerElement: +(delta / 200).toFixed(2),
    };
    for (const [t, n] of top) out["growth_" + t] = n as number;

    main.querySelectorAll(".__perf_growth__").forEach(el => el.remove());
    return out;
}

/**
 * Cost of EditorManager.switchMode(). `save()` and `getContent()` both call it
 * twice back-to-back, iterating every registered editor. With a 400-cell grid
 * this hot loop happens on every save — worth a timing signal.
 */
async function _modeSwitchCost() {
    const main = document.querySelector("main")!;
    const em = document.EditorManager;
    if (!em) return { modeSwitchMedianMs: -1, modeSwitchP95Ms: -1, modeSwitchMaxMs: -1, modeSwitchEditors: -1 };
    const now = () => performance.now();

    const frag = document.createDocumentFragment();
    for (let i = 0; i < 200; i++) {
        const p = document.createElement("p");
        p.className = "__perf_switch__";
        p.textContent = "switch " + i;
        frag.appendChild(p);
    }
    main.appendChild(frag);
    const deadline = now() + 5000;
    while (now() < deadline) {
        if (main.querySelectorAll("p.__perf_switch__[p9r-is-editor]").length >= 200) break;
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 200));

    const editorCount = (document as any).compIdentifierToEditor?.size ?? 0;
    const samples: number[] = [];
    for (let i = 0; i < 10; i++) {
        const t0 = now();
        em.switchMode(p9r.mode.VIEW);
        const toView = now() - t0;
        const t1 = now();
        em.switchMode(p9r.mode.EDITOR);
        const toEditor = now() - t1;
        samples.push(toView, toEditor);
        await new Promise(r => setTimeout(r, 20));
    }
    samples.sort((a, b) => a - b);

    main.querySelectorAll(".__perf_switch__").forEach(el => el.remove());
    return {
        modeSwitchMedianMs: +samples[Math.floor(samples.length / 2)]!.toFixed(2),
        modeSwitchP95Ms: +samples[Math.floor(samples.length * 0.95)]!.toFixed(2),
        modeSwitchMaxMs: +samples[samples.length - 1]!.toFixed(2),
        modeSwitchEditors: editorCount,
    };
}

/**
 * Leak detector: insert 500 paragraphs, remove them all, verify:
 *   (a) the editor registry empties out,
 *   (b) no listener leaks on window or document.
 * Per-element listeners are excluded — they're GC'd with the removed node.
 * Window/document handlers survive, so a forgotten `removeEventListener`
 * on a global target would show up here.
 */
async function _deleteCleanup() {
    const tracker = (window as any).__perfListeners;
    if (!tracker) return { cleanupLeakedWindowListeners: -1, cleanupLeakedDocumentListeners: -1 };
    const main = document.querySelector("main")!;
    const now = () => performance.now();

    await new Promise(r => setTimeout(r, 200));
    const beforeWindow = tracker.onWindow();
    const beforeDocument = tracker.onDocument();
    const beforeEditors = (document as any).compIdentifierToEditor?.size ?? 0;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < 500; i++) {
        const p = document.createElement("p");
        p.className = "__perf_cleanup__";
        p.textContent = "cleanup " + i;
        frag.appendChild(p);
    }
    main.appendChild(frag);
    const ready = now() + 6000;
    while (now() < ready) {
        if (main.querySelectorAll("p.__perf_cleanup__[p9r-is-editor]").length >= 500) break;
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 200));
    const afterInsertWindow = tracker.onWindow();
    const afterInsertDocument = tracker.onDocument();
    const afterInsertEditors = (document as any).compIdentifierToEditor?.size ?? 0;

    const t0 = now();
    main.querySelectorAll("p.__perf_cleanup__").forEach(el => el.remove());
    const syncRemoveMs = now() - t0;
    await new Promise(r => setTimeout(r, 300));

    const afterWindow = tracker.onWindow();
    const afterDocument = tracker.onDocument();
    const afterEditors = (document as any).compIdentifierToEditor?.size ?? 0;
    return {
        cleanupWindowBefore: beforeWindow,
        cleanupWindowPeak: afterInsertWindow,
        cleanupWindowAfter: afterWindow,
        cleanupLeakedWindowListeners: afterWindow - beforeWindow,
        cleanupDocumentBefore: beforeDocument,
        cleanupDocumentPeak: afterInsertDocument,
        cleanupDocumentAfter: afterDocument,
        cleanupLeakedDocumentListeners: afterDocument - beforeDocument,
        cleanupEditorsBefore: beforeEditors,
        cleanupEditorsPeak: afterInsertEditors,
        cleanupEditorsAfter: afterEditors,
        cleanupLeakedEditors: afterEditors - beforeEditors,
        cleanupSyncRemoveMs: +syncRemoveMs.toFixed(2),
    };
}

/**
 * Full create→destroy cycle. Adds 200 <p>, waits for editorization, removes
 * them all. Checks that the editor registry and global listener count return
 * to baseline. Absolute ceilings catch leaks the baseline might hide.
 */
async function _editorLifecycleLeak() {
    const tracker = (window as any).__perfListeners;
    const main = document.querySelector("main")!;
    const mapBefore = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersBefore = tracker ? tracker.total() : -1;
    const globalBefore = tracker ? (tracker.onWindow() + tracker.onDocument()) : -1;
    const leakBaselineByType = tracker && tracker.globalByType ? tracker.globalByType() : {};
    const heapBefore = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;

    const frag = document.createDocumentFragment();
    for (let i = 0; i < 200; i++) {
        const p = document.createElement("p");
        p.className = "__perf_leak__";
        p.textContent = "leak " + i;
        frag.appendChild(p);
    }
    main.appendChild(frag);
    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
        const done = main.querySelectorAll("p.__perf_leak__[p9r-is-editor]").length;
        if (done >= 200) break;
        await new Promise(r => setTimeout(r, 10));
    }
    await new Promise(r => setTimeout(r, 200));
    const mapPeak = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersPeak = tracker ? tracker.total() : -1;

    document.EditorManager?.switchMode(p9r.mode.VIEW);
    document.EditorManager?.switchMode(p9r.mode.EDITOR);
    await new Promise(r => setTimeout(r, 100));

    main.querySelectorAll(".__perf_leak__").forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 600));

    if ((performance as any).memory) {
        for (let i = 0; i < 5; i++) await new Promise(r => setTimeout(r, 60));
    }

    const mapAfter = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersAfter = tracker ? tracker.total() : -1;
    const globalAfter = tracker ? (tracker.onWindow() + tracker.onDocument()) : -1;
    const heapAfter = (performance as any).memory ? (performance as any).memory.usedJSHeapSize : 0;

    const leakedByType: Record<string, number> = {};
    if (tracker && tracker.globalByType) {
        const snap = tracker.globalByType();
        for (const [k, v] of Object.entries(snap)) {
            const before = (leakBaselineByType || {})[k] || 0;
            const d = (v as number) - before;
            if (d !== 0) leakedByType[k] = d;
        }
    }

    const out: Record<string, number> = {
        leakMapBefore: mapBefore,
        leakMapPeak: mapPeak,
        leakMapAfter: mapAfter,
        leakMapResidual: mapAfter - mapBefore,
        leakListenersBefore: listenersBefore,
        leakListenersPeak: listenersPeak,
        leakListenersAfter: listenersAfter,
        leakGlobalResidual: globalAfter - globalBefore,
        leakHeapGrowthKB: +((heapAfter - heapBefore) / 1024).toFixed(1),
    };
    const top = Object.entries(leakedByType).sort((a: any, b: any) => b[1] - a[1]).slice(0, 5);
    for (const [t, n] of top) out["leak_" + t] = n;
    return out;
}

export const listenerScan: BrowserScenario = {
    name: "listener-scan",
    run: _listenerScan.toString(),
};

export const listenerGrowth: BrowserScenario = {
    name: "listener-growth",
    absolutes: { growthPerElement: 3 },
    run: _listenerGrowth.toString(),
};

export const modeSwitchCost: BrowserScenario = {
    name: "mode-switch-cost",
    absolutes: { modeSwitchMedianMs: 50, modeSwitchP95Ms: 120, modeSwitchMaxMs: 200 },
    run: _modeSwitchCost.toString(),
};

export const deleteCleanup: BrowserScenario = {
    name: "delete-cleanup",
    absolutes: {
        cleanupLeakedWindowListeners: 0,
        cleanupLeakedDocumentListeners: 0,
        cleanupLeakedEditors: 0,
        cleanupSyncRemoveMs: 100,
    },
    run: _deleteCleanup.toString(),
};

export const editorLifecycleLeak: BrowserScenario = {
    name: "editor-lifecycle-leak",
    absolutes: {
        leakMapResidual: 0,
        leakGlobalResidual: 0,
    },
    run: _editorLifecycleLeak.toString(),
};
