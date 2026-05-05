import { type BrowserScenario, type DriverScenario } from "./types";

/**
 * Deeply nested insertion: builds a 30-level chain of <ul><li>…</ul></li>
 * inserted as a single subtree. ObserverManager.make_it_editor runs
 * querySelectorAll('*') on the root, exercising the "one mutation, many editors"
 * path.
 */
async function _deepNesting() {
    const main = document.querySelector("main")!;
    const now = () => performance.now();
    const DEPTH = 30;

    let root = document.createElement("ul");
    root.className = "__perf_deep__";
    let cursor = root;
    for (let i = 0; i < DEPTH; i++) {
        const li = document.createElement("li");
        const child = document.createElement("ul");
        li.appendChild(child);
        cursor.appendChild(li);
        cursor = child;
    }
    const leaf = document.createElement("p");
    leaf.textContent = "leaf";
    cursor.appendChild(leaf);

    const totalEditables = root.querySelectorAll("ul, li, p").length;

    const t0 = now();
    main.appendChild(root);
    const deadline = t0 + 5000;
    while (now() < deadline) {
        if (leaf.hasAttribute("p9r-is-editor")) break;
        await new Promise(r => setTimeout(r, 5));
    }
    const settleMs = now() - t0;
    const editorized = root.querySelectorAll("[p9r-is-editor]").length;

    root.remove();
    await new Promise(r => setTimeout(r, 200));
    return {
        deepNestingSettleMs: +settleMs.toFixed(2),
        deepNestingNodes: totalEditables,
        deepNestingEditorized: editorized,
    };
}

/**
 * Shadow DOM topology survey. Walks every shadow root reachable from the
 * document, reports max depth + total shadow root count + max slotted children.
 * Also measures style recalc cost via a CSS variable toggle.
 */
async function _shadowDomDepth() {
    const visit = (root: Document | ShadowRoot, depth: number, acc: { maxDepth: number; totalShadowRoots: number; maxSlotted: number }) => {
        acc.maxDepth = Math.max(acc.maxDepth, depth);
        for (const el of root.querySelectorAll("*")) {
            if (el.shadowRoot) {
                acc.totalShadowRoots++;
                acc.maxSlotted = Math.max(acc.maxSlotted, el.children.length);
                visit(el.shadowRoot, depth + 1, acc);
            }
        }
    };
    const acc = { maxDepth: 0, totalShadowRoots: 0, maxSlotted: 0 };
    visit(document, 0, acc);

    const now = () => performance.now();
    const samples: number[] = [];
    for (let i = 0; i < 20; i++) {
        document.documentElement.style.setProperty("--__perf_probe", String(i));
        const t = now();
        void document.body.getBoundingClientRect();
        samples.push(now() - t);
    }
    document.documentElement.style.removeProperty("--__perf_probe");
    samples.sort((a, b) => a - b);
    return {
        shadowMaxDepth: acc.maxDepth,
        shadowRootCount: acc.totalShadowRoots,
        shadowMaxSlottedChildren: acc.maxSlotted,
        recalcMedianMs: +samples[Math.floor(samples.length / 2)]!.toFixed(3),
        recalcP95Ms: +samples[Math.floor(samples.length * 0.95)]!.toFixed(3),
    };
}

/**
 * Insert every registered perf-* bloc once and measure the per-bloc
 * editorization cost. Catches regressions in the hot path that plain <p>
 * insertions miss.
 */
async function _blocRealInsert() {
    const main = document.querySelector("main")!;
    const tags = [
        "perf-badge", "perf-divider", "perf-button", "perf-icon-box",
        "perf-card", "perf-hero", "perf-stat", "perf-testimonial",
        "perf-nav-item", "perf-feature-grid",
    ];
    main.querySelectorAll(".__perf_bloc__").forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 100));

    const tracker = (window as any).__perfListeners;
    const mapBefore = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersBefore = tracker ? tracker.total() : -1;

    const perBloc: { tag: string; ms: number }[] = [];
    const t0 = performance.now();
    for (const tag of tags) {
        const t = performance.now();
        const el = document.createElement(tag);
        el.classList.add("__perf_bloc__");
        main.appendChild(el);
        const deadline = performance.now() + 800;
        while (performance.now() < deadline) {
            if (el.getAttribute("p9r-is-editor") || el.hasAttribute("p9r-opaque")) break;
            await new Promise(r => requestAnimationFrame(r));
        }
        perBloc.push({ tag, ms: +(performance.now() - t).toFixed(2) });
    }
    const totalMs = performance.now() - t0;

    await new Promise(r => setTimeout(r, 200));
    const mapAfter = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersAfter = tracker ? tracker.total() : -1;

    const times = perBloc.map(p => p.ms);
    const sorted = [...times].sort((a, b) => a - b);
    const median = sorted[Math.floor(sorted.length / 2)]!;
    const max = sorted[sorted.length - 1]!;

    const out: Record<string, number> = {
        blocTotalMs: +totalMs.toFixed(1),
        blocMedianMs: +median.toFixed(2),
        blocMaxMs: +max.toFixed(2),
        blocsInserted: tags.length,
        blocMapDelta: mapAfter - mapBefore,
        blocListenerDelta: listenersAfter - listenersBefore,
    };
    for (const p of perBloc) out["ms_" + p.tag] = p.ms;
    return out;
}

/**
 * Builds a realistic landing page from the perf blocs and measures total
 * editorize + serialize round-trip, plus peak listener / editor counts.
 * Closest proxy to "what a real user page does".
 */
async function _realisticLanding() {
    const main = document.querySelector("main")!;
    main.querySelectorAll(".__perf_landing__").forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 100));

    const tracker = (window as any).__perfListeners;
    const mapBefore = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersBefore = tracker ? tracker.total() : -1;

    const root = document.createElement("div");
    root.className = "__perf_landing__";
    root.innerHTML = `
        <perf-hero align="center">
            <h1>Build faster with Cms</h1>
            <p slot="subtitle">Compose pages from vetted blocs — ship in minutes.</p>
            <perf-button slot="ctas">Get started</perf-button>
            <perf-button slot="ctas" variant="ghost">Learn more</perf-button>
        </perf-hero>
        <perf-feature-grid columns="4">
            <perf-icon-box slot="items"><h4>Fast</h4><p slot="caption">Instant HMR.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Typed</h4><p slot="caption">End-to-end TS.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Modular</h4><p slot="caption">One bloc, one folder.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Open</h4><p slot="caption">MIT license.</p></perf-icon-box>
        </perf-feature-grid>
        <perf-card><h3>Card one</h3><p slot="body">Description of card one.</p><perf-button slot="actions">Open</perf-button></perf-card>
        <perf-card><h3>Card two</h3><p slot="body">Description of card two.</p><perf-button slot="actions">Open</perf-button><perf-button slot="actions" variant="ghost">Share</perf-button></perf-card>
        <perf-card><h3>Card three</h3><p slot="body">Description of card three.</p></perf-card>
        <perf-testimonial><p>Using these blocs saved us weeks of frontend work.</p><span slot="author">Alex — Engineering Lead</span></perf-testimonial>
        <p><perf-nav-item>About</perf-nav-item><perf-nav-item>Pricing</perf-nav-item><perf-nav-item>Contact</perf-nav-item></p>
        <perf-divider></perf-divider>
        <perf-stat value="1200">Users</perf-stat>
        <perf-stat value="48">Blocs</perf-stat>
        <perf-badge>Beta</perf-badge>
    `;

    const t0 = performance.now();
    main.appendChild(root);
    const syncAppendMs = performance.now() - t0;

    const deadline = performance.now() + 3000;
    while (performance.now() < deadline) {
        const unprocessed = root.querySelectorAll("[p9r-opaque] [p9r-is-editor]").length;
        const busy = root.querySelector("[p9r-is-creating]");
        if (!busy && unprocessed === 0) break;
        await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 150));
    const settleMs = performance.now() - t0;

    const editorizedNodes = root.querySelectorAll("[p9r-is-editor]").length;
    const s0 = performance.now();
    const content = document.EditorManager.getContent();
    const serializeMs = performance.now() - s0;

    const mapAfter = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersAfter = tracker ? tracker.total() : -1;

    root.remove();
    await new Promise(r => setTimeout(r, 400));
    const mapFinal = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersFinal = tracker ? tracker.total() : -1;

    return {
        landingAppendMs: +syncAppendMs.toFixed(2),
        landingSettleMs: +settleMs.toFixed(1),
        landingSerializeMs: +serializeMs.toFixed(2),
        landingEditorizedNodes: editorizedNodes,
        landingContentBytes: content.length,
        landingMapPeak: mapAfter - mapBefore,
        landingListenerPeak: listenersAfter - listenersBefore,
        landingMapResidual: mapFinal - mapBefore,
        landingListenerResidual: listenersFinal - listenersBefore,
    };
}

/**
 * Reproduces the user-reported lag when the BlocLibrary inserts a sizeable
 * template. The fragment carries IS_CREATING markers exactly like
 * `openChangeComponentPicker` in BlocActionGroup does, so the ObserverManager
 * walk + editorize + CompSync init + rAF-cascade costs are all captured.
 */
async function _insertLargeTemplate() {
    const main = document.querySelector("main")!;
    main.querySelectorAll(".__perf_tpl__").forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 150));

    const tracker = (window as any).__perfListeners;
    const mapBefore = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersBefore = tracker ? tracker.total() : -1;

    const REPEAT = 3;
    const unit = `
        <perf-hero align="center">
            <h1>Build faster with Cms</h1>
            <p slot="subtitle">Compose pages from vetted blocs — ship in minutes.</p>
            <perf-button slot="ctas">Get started</perf-button>
            <perf-button slot="ctas" variant="ghost">Learn more</perf-button>
        </perf-hero>
        <perf-feature-grid columns="4">
            <perf-icon-box slot="items"><h4>Fast</h4><p slot="caption">Instant HMR.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Typed</h4><p slot="caption">End-to-end TS.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Modular</h4><p slot="caption">One bloc, one folder.</p></perf-icon-box>
            <perf-icon-box slot="items"><h4>Open</h4><p slot="caption">MIT license.</p></perf-icon-box>
        </perf-feature-grid>
        <perf-card><h3>Card one</h3><p slot="body">Description.</p><perf-button slot="actions">Open</perf-button><perf-button slot="actions" variant="ghost">Share</perf-button></perf-card>
        <perf-card><h3>Card two</h3><p slot="body">Description.</p><perf-button slot="actions">Open</perf-button></perf-card>
        <perf-card><h3>Card three</h3><p slot="body">Description.</p><perf-button slot="actions">Details</perf-button></perf-card>
        <perf-card><h3>Card four</h3><p slot="body">Description.</p><perf-button slot="actions">Buy</perf-button><perf-button slot="actions" variant="ghost">Preview</perf-button></perf-card>
        <perf-testimonial><p>Using these blocs saved us weeks of frontend work.</p><span slot="author">Alex — Engineering Lead</span></perf-testimonial>
        <p><perf-nav-item>About</perf-nav-item><perf-nav-item>Pricing</perf-nav-item><perf-nav-item>Contact</perf-nav-item><perf-nav-item>Docs</perf-nav-item></p>
        <perf-stat value="1200">Users</perf-stat>
        <perf-stat value="48">Blocs</perf-stat>
        <perf-badge>Beta</perf-badge>
        <perf-divider></perf-divider>
    `;
    let html = "";
    for (let i = 0; i < REPEAT; i++) html += unit;

    const longTasks: number[] = [];
    let po: PerformanceObserver | undefined;
    try {
        po = new PerformanceObserver(list => {
            for (const e of list.getEntries()) longTasks.push(e.duration);
        });
        po.observe({ entryTypes: ["longtask"] });
    } catch {}

    const fragment = document.createRange().createContextualFragment(html);
    Array.from(fragment.children).forEach(el => {
        el.classList.add("__perf_tpl__");
        el.setAttribute("p9r-is-creating", "true");
    });
    const topChildrenCount = fragment.children.length;

    const t0 = performance.now();
    main.appendChild(fragment);
    const syncAppendMs = performance.now() - t0;

    const deadline = performance.now() + 5000;
    while (performance.now() < deadline) {
        const busy = main.querySelector(".__perf_tpl__[p9r-is-creating]");
        if (!busy) break;
        await new Promise(r => setTimeout(r, 20));
    }
    await new Promise(r => setTimeout(r, 200));
    const settleMs = performance.now() - t0;

    if (po) po.disconnect();
    const totalLongTaskMs = longTasks.reduce((a, b) => a + b, 0);
    const maxLongTaskMs = longTasks.length ? Math.max(...longTasks) : 0;

    const editorizedNodes = main.querySelectorAll(".__perf_tpl__ [p9r-is-editor], .__perf_tpl__[p9r-is-editor]").length;
    const mapAfter = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersAfter = tracker ? tracker.total() : -1;

    main.querySelectorAll(".__perf_tpl__").forEach(el => el.remove());
    await new Promise(r => setTimeout(r, 400));
    const mapFinal = (document as any).compIdentifierToEditor?.size ?? -1;
    const listenersFinal = tracker ? tracker.total() : -1;

    return {
        tplTopChildren: topChildrenCount,
        tplAppendMs: +syncAppendMs.toFixed(2),
        tplSettleMs: +settleMs.toFixed(1),
        tplEditorizedNodes: editorizedNodes,
        tplLongTaskCount: longTasks.length,
        tplTotalLongTaskMs: +totalLongTaskMs.toFixed(1),
        tplMaxLongTaskMs: +maxLongTaskMs.toFixed(1),
        tplMapPeak: mapAfter - mapBefore,
        tplListenerPeak: listenersAfter - listenersBefore,
        tplMapResidual: mapFinal - mapBefore,
        tplListenerResidual: listenersFinal - listenersBefore,
    };
}

export const deepNesting: BrowserScenario = {
    name: "deep-nesting-build",
    absolutes: { deepNestingSettleMs: 150 },
    run: _deepNesting.toString(),
};

/**
 * Core Web Vitals on the editor page. Re-navigates to get a clean document
 * state, then collects LCP, CLS, FCP and navigation timings.
 */
export const webVitals: DriverScenario = {
    kind: "driver",
    name: "web-vitals",
    absolutes: { lcpMs: 2500, cls: 0.1, fcpMs: 2000, domContentLoadedMs: 2000 },
    async run(page): Promise<Record<string, number>> {
        const currentUrl = page.url();
        await page.evaluate(() => {
            const w = window as unknown as { __vitals?: { lcp: number; cls: number; entries: number } };
            w.__vitals = { lcp: 0, cls: 0, entries: 0 };
        });
        await page.goto(currentUrl, { waitUntil: "domcontentloaded" });
        await page.evaluate(() => {
            const w = window as unknown as { __vitals: { lcp: number; cls: number; entries: number } };
            w.__vitals = { lcp: 0, cls: 0, entries: 0 };
            const lcp = new PerformanceObserver((list) => {
                for (const e of list.getEntries()) w.__vitals.lcp = Math.max(w.__vitals.lcp, e.startTime);
            });
            lcp.observe({ type: "largest-contentful-paint", buffered: true });
            const cls = new PerformanceObserver((list) => {
                for (const e of list.getEntries() as unknown as Array<{ value: number; hadRecentInput: boolean }>) {
                    if (!e.hadRecentInput) { w.__vitals.cls += e.value; w.__vitals.entries++; }
                }
            });
            cls.observe({ type: "layout-shift", buffered: true });
        });
        await page.waitForSelector("main p", { timeout: 10000 });
        await page.waitForTimeout(3000);

        const result = await page.evaluate(() => {
            const w = window as unknown as { __vitals: { lcp: number; cls: number; entries: number } };
            const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
            const paints = performance.getEntriesByType("paint") as Array<PerformanceEntry & { name: string; startTime: number }>;
            const fcp = paints.find(p => p.name === "first-contentful-paint")?.startTime ?? 0;
            return {
                lcp: w.__vitals.lcp,
                cls: w.__vitals.cls,
                clsEntries: w.__vitals.entries,
                fcp,
                domContentLoaded: nav ? nav.domContentLoadedEventEnd - nav.startTime : 0,
                loadEvent: nav ? nav.loadEventEnd - nav.startTime : 0,
            };
        });
        return {
            lcpMs: +result.lcp.toFixed(1),
            cls: +result.cls.toFixed(4),
            clsShifts: result.clsEntries,
            fcpMs: +result.fcp.toFixed(1),
            domContentLoadedMs: +result.domContentLoaded.toFixed(1),
            loadEventMs: +result.loadEvent.toFixed(1),
        };
    },
};

export const shadowDomDepth: BrowserScenario = {
    name: "shadow-dom-depth",
    absolutes: { shadowMaxDepth: 5, recalcP95Ms: 5 },
    run: _shadowDomDepth.toString(),
};

/**
 * Reloads the editor while recording every HTTP request. Flags duplicate URLs,
 * oversized payloads, and responses served without compression.
 */
export const networkDuplicates: DriverScenario = {
    kind: "driver",
    name: "network-duplicates",
    absolutes: { netDuplicateRequests: 0, netOversizePayloads: 0, netFailedRequests: 0 },
    async run(page): Promise<Record<string, number>> {
        type Req = { url: string; status: number; bytes: number; encoded: boolean };
        const requests: Req[] = [];
        const respListener = async (resp: import("playwright").Response) => {
            try {
                const url = resp.url();
                if (!url.startsWith(page.url().split("/").slice(0, 3).join("/"))) return;
                const enc = (resp.headers()["content-encoding"] || "").toLowerCase();
                const lenHdr = resp.headers()["content-length"];
                let bytes = lenHdr ? parseInt(lenHdr, 10) : 0;
                if (!bytes) {
                    try { const buf = await resp.body(); bytes = buf.byteLength; } catch { /* aborted */ }
                }
                requests.push({ url, status: resp.status(), bytes, encoded: enc === "gzip" || enc === "br" || enc === "deflate" });
            } catch { /* response already disposed */ }
        };
        page.on("response", respListener);
        await page.goto(page.url(), { waitUntil: "load" });
        await page.waitForSelector("main p", { timeout: 10000 });
        await page.waitForTimeout(500);
        page.off("response", respListener);

        const urls = new Map<string, number>();
        for (const r of requests) urls.set(r.url, (urls.get(r.url) ?? 0) + 1);
        const duplicates = Array.from(urls.values()).filter(n => n > 1).reduce((a, n) => a + (n - 1), 0);
        const duplicateUrls = Array.from(urls.entries()).filter(([, n]) => n > 1).length;
        const totalBytes = requests.reduce((a, r) => a + r.bytes, 0);
        return {
            netRequestCount: requests.length,
            netUniqueUrls: urls.size,
            netDuplicateUrls: duplicateUrls,
            netDuplicateRequests: duplicates,
            netTotalKB: +(totalBytes / 1024).toFixed(1),
            netOversizePayloads: requests.filter(r => r.bytes > 500 * 1024).length,
            netUncompressedLargePayloads: requests.filter(r => !r.encoded && r.bytes > 50 * 1024).length,
            netFailedRequests: requests.filter(r => r.status >= 400).length,
        };
    },
};

export const blocRealInsert: BrowserScenario = {
    name: "bloc-real-insert",
    absolutes: { blocMedianMs: 20, blocMaxMs: 80, blocTotalMs: 400 },
    run: _blocRealInsert.toString(),
};

export const realisticLanding: BrowserScenario = {
    name: "realistic-landing",
    absolutes: { landingAppendMs: 80, landingSettleMs: 1500, landingSerializeMs: 30 },
    run: _realisticLanding.toString(),
};

export const insertLargeTemplate: BrowserScenario = {
    name: "insert-large-template",
    absolutes: { tplMaxLongTaskMs: 500, tplSettleMs: 3000 },
    run: _insertLargeTemplate.toString(),
};
