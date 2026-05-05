import type { Page } from "playwright";
import { type DriverScenario, stats, ensureFocusedParagraph } from "./types";

export const typeAndEnter: DriverScenario = {
    kind: "driver",
    name: "type-and-enter",
    absolutes: { typeMedianMs: 15, typeP95Ms: 30, enterMedianMs: 20, enterP95Ms: 40 },
    async run(page): Promise<Record<string, number>> {
        await ensureFocusedParagraph(page);
        const typeSamples: number[] = [];
        const enterSamples: number[] = [];
        for (let cycle = 0; cycle < 20; cycle++) {
            for (let i = 0; i < 10; i++) {
                const t = await page.evaluate(() => performance.now());
                await page.keyboard.type("x");
                const t2 = await page.evaluate(() => performance.now());
                typeSamples.push(t2 - t);
            }
            const t = await page.evaluate(() => performance.now());
            await page.keyboard.press("Enter");
            const t2 = await page.evaluate(() => performance.now());
            enterSamples.push(t2 - t);
        }
        const ty = stats(typeSamples);
        const en = stats(enterSamples);
        return {
            typeMedianMs: ty.median, typeP95Ms: ty.p95, typeMaxMs: ty.max,
            enterMedianMs: en.median, enterP95Ms: en.p95, enterMaxMs: en.max,
        };
    },
};

export const holdEnter30: DriverScenario = {
    kind: "driver",
    name: "hold-enter-30",
    absolutes: { holdEnterMedianMs: 20, holdEnterP95Ms: 40, holdEnterMaxMs: 80 },
    async run(page): Promise<Record<string, number>> {
        await ensureFocusedParagraph(page);
        await page.keyboard.type("seed");

        const enterSamples: number[] = [];
        const t0 = await page.evaluate(() => performance.now());
        for (let i = 0; i < 30; i++) {
            const t = await page.evaluate(() => performance.now());
            await page.keyboard.press("Enter");
            const t2 = await page.evaluate(() => performance.now());
            enterSamples.push(t2 - t);
        }
        const tEnd = await page.evaluate(() => performance.now());

        const s = stats(enterSamples);
        return {
            holdEnterTotalMs: +(tEnd - t0).toFixed(1),
            holdEnterMedianMs: s.median,
            holdEnterP95Ms: s.p95,
            holdEnterMaxMs: s.max,
            holdEnterLastMs: +enterSamples[enterSamples.length - 1]!.toFixed(3),
        };
    },
};

/**
 * Simulates a real OS key-repeat: Enter held down for ~500ms. Playwright's
 * `keyboard.down` + `up` replays native auto-repeat keydown events, unlike
 * 30 sequential `press()` calls which are discrete. Catches focus-race bugs
 * where the double-rAF focus-on-new-sibling hasn't fired yet, so every
 * repeated Enter lands on the SAME original target and `target.after()`
 * stacks siblings behind it.
 */
export const holdEnterReal: DriverScenario = {
    kind: "driver",
    name: "hold-enter-real",
    async run(page): Promise<Record<string, number>> {
        await ensureFocusedParagraph(page);
        await page.keyboard.type("seed");

        const countBefore = await page.evaluate(() => document.querySelectorAll("main p").length);

        const t0 = await page.evaluate(() => performance.now());
        await page.evaluate(async () => {
            const fire = () => {
                const target = document.activeElement as HTMLElement;
                if (!target) return;
                target.dispatchEvent(new KeyboardEvent("keydown", {
                    key: "Enter", code: "Enter", keyCode: 13, which: 13,
                    bubbles: true, cancelable: true, repeat: true,
                }));
            };
            for (let i = 0; i < 15; i++) {
                fire();
                await new Promise(r => setTimeout(r, 33));
            }
        });
        await new Promise(r => setTimeout(r, 300));
        const tEnd = await page.evaluate(() => performance.now());

        const countAfter = await page.evaluate(() => document.querySelectorAll("main p").length);
        const created = countAfter - countBefore;

        const focusState = await page.evaluate(() => {
            const ps = Array.from(document.querySelectorAll("main p")) as HTMLElement[];
            const seed = ps.find(p => (p.textContent || "").includes("seed"));
            return {
                focusOnSeed: document.activeElement === seed,
                lastEmptyIsActive: ps.length > 0 && document.activeElement === ps[ps.length - 1],
            };
        });

        return {
            holdRealTotalMs: +(tEnd - t0).toFixed(1),
            holdRealCreated: created,
            holdRealStacked: focusState.focusOnSeed ? 1 : 0,
            holdRealChained: focusState.lastEmptyIsActive ? 1 : 0,
        };
    },
};

/**
 * Regression guard for the ImageSync cascade: when a bloc's ConfigPanel
 * contains a <p9r-image-sync>, every sibling mutation used to cascade into
 * ImageSync._lockActions → editor.viewEditor() on the <img> for every
 * keystroke. This scenario presses Enter inside a perf-hero (which has an
 * image-sync) and counts viewEditor() calls on the image editor — should be
 * ~0 per Enter after the fix.
 */
export const enterNextToImageSync: DriverScenario = {
    kind: "driver",
    name: "enter-next-to-image-sync",
    absolutes: {
        enterImgMedianMs: 15,
        enterImgP95Ms: 40,
        enterImgViewEditorCalls: 3,
    },
    async run(page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            main.querySelectorAll(".__perf_hero__").forEach(el => el.remove());
            const hero = document.createElement("perf-hero");
            hero.className = "__perf_hero__";
            hero.innerHTML = `<h1>Hero perf title</h1><p slot="subtitle">Subtitle</p>`;
            main.appendChild(hero);
        });
        await page.waitForTimeout(800);

        await page.evaluate(() => {
            const h1 = document.querySelector(".__perf_hero__ h1") as HTMLElement;
            h1.focus();
            const sel = getSelection()!;
            const r = document.createRange();
            r.selectNodeContents(h1);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);
        });
        await page.keyboard.type("seed");

        await page.evaluate(() => {
            const img = document.querySelector(".__perf_hero__ img") as HTMLElement | null;
            const id = img?.getAttribute("p9r-identifier");
            const editor = id ? (document as any).compIdentifierToEditor?.get(id) : null;
            (window as any).__imgViewEditorCalls = 0;
            if (editor && !editor.__perfWrapped) {
                const orig = editor.viewEditor.bind(editor);
                editor.viewEditor = function () {
                    (window as any).__imgViewEditorCalls++;
                    return orig();
                };
                editor.__perfWrapped = true;
            }
        });

        const samples: number[] = [];
        for (let i = 0; i < 15; i++) {
            const t = await page.evaluate(() => performance.now());
            await page.keyboard.press("Enter");
            const t2 = await page.evaluate(() => performance.now());
            samples.push(t2 - t);
        }
        await page.waitForTimeout(150);

        const imgViewEditorCalls = await page.evaluate(() => (window as any).__imgViewEditorCalls || 0);

        const s = stats(samples);
        return {
            enterImgMedianMs: s.median,
            enterImgP95Ms: s.p95,
            enterImgMaxMs: s.max,
            enterImgViewEditorCalls: imgViewEditorCalls,
        };
    },
};

/**
 * Hold Enter on a <p> living inside an allow-multiple slot of a complex
 * bloc (perf-card has image-sync + several comp-syncs + nested buttons).
 * Measures per-keystroke wall time AND an INP proxy via PerformanceObserver
 * on "event" entries.
 */
export const holdEnterInAllowMultiple: DriverScenario = {
    kind: "driver",
    name: "hold-enter-allow-multiple",
    absolutes: {
        inpKeydownP95Ms: 200,
        inpKeydownMaxMs: 300,
    },
    async run(page: Page): Promise<Record<string, number>> {
        await page.evaluate(() => {
            const main = document.querySelector("main")!;
            main.querySelectorAll(".__perf_card_p__").forEach(el => el.remove());
            const card = document.createElement("perf-card");
            card.className = "__perf_card_p__";
            card.innerHTML = `
                <h3>Card with paragraphs</h3>
                <p slot="body">Body description of the card.</p>
                <p slot="paragraphs" class="__seed__">seed</p>
                <p slot="paragraphs">Second existing paragraph.</p>
                <perf-button slot="actions">Primary</perf-button>
                <perf-button slot="actions" variant="ghost">Secondary</perf-button>
            `;
            main.appendChild(card);
        });
        await page.waitForTimeout(1000);

        await page.evaluate(() => {
            const seed = document.querySelector(".__perf_card_p__ .__seed__") as HTMLElement;
            seed.focus();
            const sel = getSelection()!;
            const r = document.createRange();
            r.selectNodeContents(seed);
            r.collapse(false);
            sel.removeAllRanges();
            sel.addRange(r);

            (window as any).__inpEntries = [];
            const po = new PerformanceObserver((list) => {
                for (const e of list.getEntries() as any[]) {
                    (window as any).__inpEntries.push({
                        name: e.name,
                        duration: e.duration,
                        startTime: e.startTime,
                        processingStart: e.processingStart,
                        processingEnd: e.processingEnd,
                    });
                }
            });
            try { po.observe({ type: "event", buffered: true, durationThreshold: 0 } as any); } catch {}
            (window as any).__inpObserver = po;
        });

        const countBefore = await page.evaluate(
            () => document.querySelectorAll('.__perf_card_p__ [slot="paragraphs"]').length,
        );

        for (let i = 0; i < 20; i++) {
            await page.evaluate(() => {
                const ps = document.querySelectorAll<HTMLElement>('.__perf_card_p__ [slot="paragraphs"]');
                const last = ps[ps.length - 1];
                if (last && last.isContentEditable) {
                    last.focus();
                    const sel = getSelection()!;
                    const r = document.createRange();
                    r.selectNodeContents(last);
                    r.collapse(false);
                    sel.removeAllRanges();
                    sel.addRange(r);
                }
            });
            await page.keyboard.press("Enter");
            await page.waitForTimeout(60);
        }
        await page.waitForTimeout(400);

        const countAfter = await page.evaluate(
            () => document.querySelectorAll('.__perf_card_p__ [slot="paragraphs"]').length,
        );

        const inp = await page.evaluate(() => {
            const po = (window as any).__inpObserver as PerformanceObserver | undefined;
            po?.disconnect();
            const entries = ((window as any).__inpEntries || []) as {
                name: string; duration: number; startTime: number;
                processingStart: number; processingEnd: number;
            }[];
            const keydowns = entries.filter(e => e.name === "keydown");
            const durations = keydowns.map(e => e.duration);
            const processing = keydowns.map(e => e.processingEnd - e.processingStart);
            const med = (xs: number[]) => {
                if (!xs.length) return 0;
                const s = [...xs].sort((a, b) => a - b);
                return s[Math.floor(s.length / 2)]!;
            };
            const pct = (xs: number[], q: number) => {
                if (!xs.length) return 0;
                const s = [...xs].sort((a, b) => a - b);
                return s[Math.min(s.length - 1, Math.floor(s.length * q))]!;
            };
            const max = (xs: number[]) => (xs.length ? Math.max(...xs) : 0);
            return {
                inpKeydownCount: keydowns.length,
                inpKeydownMedianMs: +med(durations).toFixed(1),
                inpKeydownP95Ms: +pct(durations, 0.95).toFixed(1),
                inpKeydownMaxMs: +max(durations).toFixed(1),
                inpProcessingMedianMs: +med(processing).toFixed(1),
                inpProcessingMaxMs: +max(processing).toFixed(1),
            };
        });

        return { holdAmCreated: countAfter - countBefore, ...inp };
    },
};
