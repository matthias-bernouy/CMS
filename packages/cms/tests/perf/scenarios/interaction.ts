import { type DriverScenario, stats } from "./types";

export const slashOpenLibrary: DriverScenario = {
    kind: "driver",
    name: "slash-open-library",
    absolutes: { slashOpenMedianMs: 50, slashOpenP95Ms: 100 },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            const p = document.createElement("p");
            main.appendChild(p);
        });
        await page.waitForTimeout(300);
        await page.evaluate(() => {
            const p = document.querySelector("main p:last-of-type") as HTMLElement;
            p.focus();
        });

        const samples: number[] = [];
        for (let i = 0; i < 8; i++) {
            const t = await page.evaluate(() => performance.now());
            await page.keyboard.press("/");
            const opened = await page.evaluate(async () => {
                const deadline = performance.now() + 1500;
                while (performance.now() < deadline) {
                    const lib = document.querySelector("w13c-action-bar");
                    if (lib && (lib as HTMLElement).offsetParent !== null) return performance.now();
                    await new Promise(r => requestAnimationFrame(r));
                }
                return -1;
            });
            if (opened > 0) samples.push(opened - t);
            await page.evaluate(() => {
                document.querySelector("w13c-action-bar")?.remove();
                const main = document.querySelector("main")!;
                const p = document.createElement("p");
                main.appendChild(p);
                (p as HTMLElement).focus();
            });
            await page.waitForTimeout(150);
        }
        if (samples.length === 0) return { slashOpenMedianMs: -1, slashOpenSamples: 0 };
        const s = stats(samples);
        return { slashOpenMedianMs: s.median, slashOpenP95Ms: s.p95, slashOpenMaxMs: s.max, slashOpenSamples: samples.length };
    },
};

export const hoverRealMouse: DriverScenario = {
    kind: "driver",
    name: "hover-real-mouse",
    absolutes: { hoverFrameP95Ms: 25, hoverFrameMaxMs: 50 },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            while (main.querySelectorAll("p").length < 30) {
                const p = document.createElement("p");
                p.textContent = "hover target " + main.querySelectorAll("p").length;
                main.appendChild(p);
            }
        });
        await page.waitForTimeout(400);

        const boxes = await page.evaluate(() =>
            Array.from(document.querySelectorAll("main p")).slice(0, 30).map(p => {
                const r = (p as HTMLElement).getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            })
        );

        await page.evaluate(() => {
            (window as any).__perfFrames = [];
            let last = performance.now();
            const loop = () => {
                const t = performance.now();
                (window as any).__perfFrames.push(t - last);
                last = t;
                (window as any).__perfRaf = requestAnimationFrame(loop);
            };
            (window as any).__perfRaf = requestAnimationFrame(loop);
        });

        for (const b of boxes) {
            await page.mouse.move(b.x, b.y, { steps: 3 });
        }
        await page.waitForTimeout(200);

        const frames = await page.evaluate(() => {
            cancelAnimationFrame((window as any).__perfRaf);
            const f = (window as any).__perfFrames as number[];
            (window as any).__perfFrames = null;
            return f;
        });
        if (frames.length === 0) return { hoverFramesP95Ms: 0, hoverFramesMaxMs: 0, hoverFrameCount: 0 };
        const s = stats(frames);
        return { hoverFrameMedianMs: s.median, hoverFrameP95Ms: s.p95, hoverFrameMaxMs: s.max, hoverFrameCount: frames.length };
    },
};

/**
 * Forces the BAG's duplicate button to show on a plain <p> (via the
 * `p9r-force-duplicate-button` opt-in attribute) and measures the real
 * hover→click→duplicate cycle. Exercises the full BlocActionGroup pipeline:
 * feature map refresh, positioning, click handler, deep-clone, and the
 * subsequent ObserverManager pass on the clone.
 */
export const bagDuplicate: DriverScenario = {
    kind: "driver",
    name: "bag-duplicate",
    absolutes: { bagDuplicateMedianMs: 30, bagDuplicateP95Ms: 60 },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            main.querySelectorAll("p.__perf_bag__").forEach(n => n.remove());
            const p = document.createElement("p");
            p.className = "__perf_bag__";
            p.setAttribute("p9r-force-duplicate-button", "true");
            p.textContent = "dup target";
            main.appendChild(p);
        });
        await page.waitForTimeout(400);

        const countBefore = await page.evaluate(() => document.querySelectorAll("main p.__perf_bag__").length);
        const samples: number[] = [];
        for (let i = 0; i < 8; i++) {
            const box = await page.evaluate(() => {
                const p = document.querySelector("main p.__perf_bag__:last-of-type") as HTMLElement;
                const r = p.getBoundingClientRect();
                return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
            });
            await page.mouse.move(box.x + 50, box.y + 50);
            await page.mouse.move(box.x, box.y);
            const btn = await page.evaluate(async () => {
                const deadline = performance.now() + 800;
                while (performance.now() < deadline) {
                    const b = document.querySelector('p9r-bloc-action-group [data-action="duplicate"]') as HTMLElement | null;
                    if (b && b.offsetParent !== null) {
                        const r = b.getBoundingClientRect();
                        return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
                    }
                    await new Promise(r => requestAnimationFrame(r));
                }
                return null;
            });
            if (!btn) break;
            const t = await page.evaluate(() => performance.now());
            await page.mouse.click(btn.x, btn.y);
            const t2 = await page.evaluate(() => performance.now());
            samples.push(t2 - t);
            await page.waitForTimeout(60);
        }
        const countAfter = await page.evaluate(() => document.querySelectorAll("main p.__perf_bag__").length);
        if (samples.length === 0) return { bagDuplicateSamples: 0, bagDuplicateMedianMs: -1, bagDuplicateCreated: 0 };
        const s = stats(samples);
        return {
            bagDuplicateMedianMs: s.median,
            bagDuplicateP95Ms: s.p95,
            bagDuplicateMaxMs: s.max,
            bagDuplicateCreated: countAfter - countBefore,
        };
    },
};

/**
 * Measures the full HTML5 drag cycle: dragstart → dragover (DragManager
 * positions the drop indicator) → drop (DOM reorder + observer pass).
 * Uses synthetic DataTransfer + dispatched events because Playwright's
 * native `page.mouse` doesn't trigger HTML5 drag across all chromium versions.
 */
export const dragReorder: DriverScenario = {
    kind: "driver",
    name: "drag-reorder",
    absolutes: { dragCycleMedianMs: 30, dragCycleP95Ms: 60, dragIndicatorMedianMs: 20 },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            main.querySelectorAll("p.__perf_drag__").forEach(n => n.remove());
            for (let i = 0; i < 6; i++) {
                const p = document.createElement("p");
                p.className = "__perf_drag__";
                p.textContent = "drag " + i;
                main.appendChild(p);
            }
        });
        await page.waitForTimeout(400);

        const result = await page.evaluate(async () => {
            const now = () => performance.now();
            const samples: number[] = [];
            const indicatorSamples: number[] = [];
            for (let i = 0; i < 6; i++) {
                const ps = Array.from(document.querySelectorAll("main p.__perf_drag__")) as HTMLElement[];
                if (ps.length < 2) break;
                const src = ps[0]!;
                const dst = ps[ps.length - 1]!;
                const srcRect = src.getBoundingClientRect();
                const dstRect = dst.getBoundingClientRect();
                const dt = new DataTransfer();
                const t0 = now();
                src.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: srcRect.x + 5, clientY: srcRect.y + 5 }));
                await new Promise(r => requestAnimationFrame(r));
                dst.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: dstRect.x + 5, clientY: dstRect.y + dstRect.height - 2 }));
                const tIndicator = now();
                await new Promise(r => requestAnimationFrame(r));
                const indicator = document.querySelector("[class*='drop-indicator'], [data-p9r-drop-indicator]") as HTMLElement | null;
                if (indicator) indicatorSamples.push(now() - tIndicator);
                dst.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer: dt, clientX: dstRect.x + 5, clientY: dstRect.y + dstRect.height - 2 }));
                src.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer: dt }));
                samples.push(now() - t0);
                await new Promise(r => setTimeout(r, 80));
            }
            const stat = (arr: number[]) => {
                if (arr.length === 0) return { median: -1, p95: -1, max: -1 };
                const s = [...arr].sort((a, b) => a - b);
                const q = (p: number) => s[Math.min(s.length - 1, Math.floor(s.length * p))]!;
                return { median: +q(0.5).toFixed(3), p95: +q(0.95).toFixed(3), max: +s[s.length - 1]!.toFixed(3) };
            };
            return { full: stat(samples), ind: stat(indicatorSamples), n: samples.length };
        });

        return {
            dragCycleMedianMs: result.full.median,
            dragCycleP95Ms: result.full.p95,
            dragCycleMaxMs: result.full.max,
            dragIndicatorMedianMs: result.ind.median,
            dragSamples: result.n,
        };
    },
};

export const selectTextToolbar: DriverScenario = {
    kind: "driver",
    name: "select-text-toolbar",
    absolutes: { selectToolbarMedianMs: 20, selectToolbarP95Ms: 40 },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            const existing = main.querySelector("p.__perf_sel__") as HTMLElement | null;
            const p = existing ?? document.createElement("p");
            p.className = "__perf_sel__";
            p.textContent = "The quick brown fox jumps over the lazy dog ".repeat(3);
            if (!existing) main.appendChild(p);
        });
        await page.waitForTimeout(300);

        const samples: number[] = [];
        for (let i = 0; i < 8; i++) {
            await page.evaluate(() => getSelection()?.removeAllRanges());
            await page.waitForTimeout(50);
            const t = await page.evaluate(() => performance.now());
            const opened = await page.evaluate(async () => {
                const p = document.querySelector("main p.__perf_sel__")!;
                const r = document.createRange();
                r.setStart(p.firstChild!, 4);
                r.setEnd(p.firstChild!, 25);
                const sel = getSelection()!;
                sel.removeAllRanges();
                sel.addRange(r);
                document.dispatchEvent(new Event("selectionchange"));
                const deadline = performance.now() + 1000;
                while (performance.now() < deadline) {
                    const bar = document.querySelector("w13c-floating-toolbar") as HTMLElement | null;
                    if (bar && (bar.offsetParent !== null || getComputedStyle(bar).visibility !== "hidden")) {
                        return performance.now();
                    }
                    await new Promise(r => requestAnimationFrame(r));
                }
                return -1;
            });
            if (opened > 0) samples.push(opened - t);
        }
        if (samples.length === 0) return { selectToolbarSamples: 0, selectToolbarMedianMs: -1 };
        const s = stats(samples);
        return { selectToolbarMedianMs: s.median, selectToolbarP95Ms: s.p95, selectToolbarMaxMs: s.max, selectToolbarSamples: samples.length };
    },
};
