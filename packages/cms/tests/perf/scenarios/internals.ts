import { type BrowserScenario } from "./types";

const bulkInsert = (count: number) => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    const longTasks = [];
    let po;
    try {
        po = new PerformanceObserver(list => {
            for (const e of list.getEntries()) longTasks.push(e.duration);
        });
        po.observe({ entryTypes: ['longtask'] });
    } catch {}

    main.querySelectorAll('p.__perf__').forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 150));
    longTasks.length = 0;

    const t0 = now();
    const frag = document.createDocumentFragment();
    for (let i = 0; i < ${count}; i++) {
        const p = document.createElement('p');
        p.className = '__perf__';
        p.textContent = 'bulk ' + i;
        frag.appendChild(p);
    }
    main.appendChild(frag);
    const syncAppendMs = now() - t0;

    await new Promise(r => setTimeout(r, 500));

    if (po) po.disconnect();
    const totalLongTaskMs = longTasks.reduce((a, b) => a + b, 0);
    const maxLongTaskMs = longTasks.length ? Math.max(...longTasks) : 0;

    return {
        syncAppendMs: +syncAppendMs.toFixed(2),
        longTaskCount: longTasks.length,
        totalLongTaskMs: +totalLongTaskMs.toFixed(1),
        maxLongTaskMs: +maxLongTaskMs.toFixed(1),
        elementsAfter: document.querySelectorAll('*').length,
    };
}
`;

const hoverCost = () => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    let ps = main.querySelectorAll('p');
    if (ps.length < 200) {
        const frag = document.createDocumentFragment();
        for (let i = ps.length; i < 200; i++) {
            const p = document.createElement('p');
            p.className = '__perf__';
            p.textContent = 'hover ' + i;
            frag.appendChild(p);
        }
        main.appendChild(frag);
        await new Promise(r => setTimeout(r, 300));
        ps = main.querySelectorAll('p');
    }
    const samples = [];
    for (let i = 0; i < 50; i++) {
        const p = ps[(i * 3) % ps.length];
        const rect = p.getBoundingClientRect();
        const t = now();
        p.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, clientX: rect.x + 5, clientY: rect.y + 5 }));
        p.dispatchEvent(new MouseEvent('mouseover', { bubbles: true, clientX: rect.x + 5, clientY: rect.y + 5 }));
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    return {
        hoverMedianMs: +samples[Math.floor(samples.length / 2)].toFixed(3),
        hoverP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
        hoverMaxMs: +samples[samples.length - 1].toFixed(3),
    };
}
`;

const typingCost = () => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    const p = document.createElement('p');
    p.className = '__perf__';
    p.setAttribute('contenteditable', 'true');
    main.prepend(p);
    await new Promise(r => setTimeout(r, 300));
    p.focus();
    const sel = getSelection();
    const r = document.createRange();
    r.selectNodeContents(p);
    r.collapse(false);
    sel.removeAllRanges();
    sel.addRange(r);

    const samples = [];
    for (let i = 0; i < 100; i++) {
        const t = now();
        document.execCommand('insertText', false, 'a');
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    p.remove();
    return {
        typingMedianMs: +samples[Math.floor(samples.length / 2)].toFixed(3),
        typingP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
        typingMaxMs: +samples[samples.length - 1].toFixed(3),
    };
}
`;

const serializeCost = () => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    const samples = [];
    for (let i = 0; i < 20; i++) {
        const t = now();
        const _ = main.innerHTML.length;
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    return {
        serializeMedianMs: +samples[Math.floor(samples.length / 2)].toFixed(3),
        serializeP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(3),
        serializedBytes: main.innerHTML.length,
    };
}
`;

const editorObserverScaling = () => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    const samples = [];
    for (let i = 0; i < 20; i++) {
        const p = document.createElement('p');
        p.className = '__perf__';
        p.textContent = 'obs ' + i;
        const t = now();
        main.appendChild(p);
        const deadline = t + 50;
        while (!p.hasAttribute('p9r-is-editor') && now() < deadline) {
            await new Promise(r => setTimeout(r, 1));
        }
        samples.push(now() - t);
    }
    samples.sort((a, b) => a - b);
    return {
        observerLagMedianMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
        observerLagP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
        observerLagMaxMs: +samples[samples.length - 1].toFixed(2),
    };
}
`;

const memoryFootprint = () => `
async () => {
    const mem = performance.memory;
    return {
        heapUsedMB: mem ? +(mem.usedJSHeapSize / 1048576).toFixed(2) : 0,
        domElements: document.querySelectorAll('*').length,
    };
}
`;

/**
 * Single-paragraph insert latency: time from appendChild() to the new node carrying
 * `p9r-is-editor`. This is the user-perceived latency of "I added one element".
 * Baseline-free intuition: <5ms is healthy, >15ms is a bug.
 */
const singleParagraphInsert = () => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    {
        const warm = document.createElement('p');
        main.appendChild(warm);
        const deadline = now() + 100;
        while (!warm.hasAttribute('p9r-is-editor') && now() < deadline) {
            await new Promise(r => setTimeout(r, 1));
        }
    }

    const samples = [];
    for (let i = 0; i < 30; i++) {
        const p = document.createElement('p');
        p.textContent = 'single ' + i;
        const t = now();
        main.appendChild(p);
        const deadline = t + 100;
        while (!p.hasAttribute('p9r-is-editor') && now() < deadline) {
            await new Promise(r => setTimeout(r, 1));
        }
        samples.push(now() - t);
        await new Promise(r => setTimeout(r, 10));
    }
    samples.sort((a, b) => a - b);
    return {
        singleInsertMedianMs: +samples[Math.floor(samples.length / 2)].toFixed(2),
        singleInsertP95Ms: +samples[Math.floor(samples.length * 0.95)].toFixed(2),
        singleInsertMaxMs: +samples[samples.length - 1].toFixed(2),
    };
}
`;

/**
 * Build a large grid (rows × cols <p> inside a wrapper). Measures raw DOM
 * append time, observer settle wait, and final serialized byte count. Mimics
 * the "grid of items" workload users hit when composing big templates.
 */
const largeGridBuild = (rows: number, cols: number) => `
async () => {
    const main = document.querySelector('main');
    const now = () => performance.now();
    main.querySelectorAll('.__perf_grid__').forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 100));

    const t0 = now();
    const grid = document.createElement('div');
    grid.className = '__perf_grid__';
    grid.style.display = 'grid';
    grid.style.gridTemplateColumns = 'repeat(${cols}, 1fr)';
    for (let r = 0; r < ${rows}; r++) {
        for (let c = 0; c < ${cols}; c++) {
            const cell = document.createElement('div');
            const p = document.createElement('p');
            p.textContent = 'cell ' + r + ',' + c;
            cell.appendChild(p);
            grid.appendChild(cell);
        }
    }
    main.appendChild(grid);
    const appendMs = now() - t0;

    const tObs = now();
    const total = grid.querySelectorAll('p').length;
    const deadline = tObs + 5000;
    while (now() < deadline) {
        const done = grid.querySelectorAll('p[p9r-is-editor]').length;
        if (done >= total) break;
        await new Promise(r => setTimeout(r, 10));
    }
    const observeMs = now() - tObs;

    const tSer = now();
    const editorModeBytes = main.innerHTML.length;
    const serializeMs = now() - tSer;

    const em = document.EditorManager;
    const tView = now();
    const viewModeBytes = em ? em.getContent().length : -1;
    const viewSerializeMs = now() - tView;

    return {
        buildAppendMs: +appendMs.toFixed(2),
        buildObserveMs: +observeMs.toFixed(1),
        buildSerializeMs: +serializeMs.toFixed(2),
        buildViewSerializeMs: +viewSerializeMs.toFixed(2),
        buildCellCount: total,
        buildEditorModeBytes: editorModeBytes,
        buildViewModeBytes: viewModeBytes,
    };
}
`;

export const bulkInsert200: BrowserScenario = {
    name: "bulk-insert-200",
    absolutes: { syncAppendMs: 5, maxLongTaskMs: 150 },
    run: bulkInsert(200),
};

export const bulkInsert1000: BrowserScenario = {
    name: "bulk-insert-1000",
    absolutes: { syncAppendMs: 15, maxLongTaskMs: 400 },
    run: bulkInsert(1000),
};

export const observerScaling: BrowserScenario = {
    name: "observer-scaling",
    absolutes: { observerLagMedianMs: 15, observerLagP95Ms: 25, observerLagMaxMs: 40 },
    run: editorObserverScaling(),
};

export const singlePInsert: BrowserScenario = {
    name: "single-p-insert",
    absolutes: { singleInsertMedianMs: 10, singleInsertP95Ms: 20, singleInsertMaxMs: 30 },
    run: singleParagraphInsert(),
};

export const hoverCostScenario: BrowserScenario = {
    name: "hover-cost",
    absolutes: { hoverMedianMs: 2, hoverP95Ms: 5, hoverMaxMs: 10 },
    run: hoverCost(),
};

export const typingCostScenario: BrowserScenario = {
    name: "typing-cost",
    absolutes: { typingMedianMs: 3, typingP95Ms: 6, typingMaxMs: 15 },
    run: typingCost(),
};

export const serializeCostScenario: BrowserScenario = {
    name: "serialize-cost",
    absolutes: { serializeMedianMs: 5, serializeP95Ms: 10 },
    run: serializeCost(),
};

export const largeGridBuild20x20: BrowserScenario = {
    name: "large-grid-build",
    absolutes: { buildAppendMs: 50, buildObserveMs: 2000, buildSerializeMs: 15, buildViewSerializeMs: 50 },
    run: largeGridBuild(20, 20),
};

export const memoryFootprintScenario: BrowserScenario = {
    name: "memory-footprint",
    run: memoryFootprint(),
};
