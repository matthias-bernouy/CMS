/**
 * Perf runner.
 *
 * Usage:
 *   bun run tests/perf/run.ts                  # run all scenarios, print report
 *   bun run tests/perf/run.ts --save           # also overwrite the baseline
 *   bun run tests/perf/run.ts --only=hover-cost,typing-cost
 *   bun run tests/perf/run.ts --headed         # show browser window
 *
 * A fresh `p9r_perf_test` MongoDB database is created for each run, so results
 * are deterministic. Requires a local MongoDB on 27017 and Playwright's chromium
 * (`bunx playwright install chromium` once).
 */

import { chromium, type Browser, type Page } from "playwright";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { startPerfServer, type PerfServer } from "./server";
import { SCENARIOS, type Scenario } from "./scenarios";

const BASELINE_PATH = resolve(import.meta.dir, "baseline.json");
const DEFAULT_TOLERANCE = 0.30; // 30 % slower triggers a regression warning.
const MIN_ABS_DELTA_MS = 1.0;   // Ignore sub-1ms swings; they are noise, not regressions.
const MIN_BASELINE_MS = 2.0;    // Metrics whose baseline is below this aren't gated — relative % is meaningless on tiny values.

type ScenarioResult = { name: string; metrics: Record<string, number>; durationMs: number };
type RunReport = {
    createdAt: string;
    scenarios: ScenarioResult[];
};

function parseArgs() {
    const argv = process.argv.slice(2);
    return {
        save: argv.includes("--save"),
        headed: argv.includes("--headed"),
        only: ((argv.find(a => a.startsWith("--only=")) ?? "").slice("--only=".length) || "")
            .split(",").map(s => s.trim()).filter(Boolean),
    };
}

async function authenticate(page: Page, baseUrl: string, email: string, password: string) {
    // Use the browser's fetch (with cookie jar) — playwright's request API trips on
    // Set-Cookie parsing when running under Bun.
    await page.goto(`${baseUrl}/auth/login`, { waitUntil: "domcontentloaded" });
    const result = await page.evaluate(async (creds) => {
        const setup = await fetch("/auth/setupSubmit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(creds),
            credentials: "include",
        });
        if (!setup.ok) {
            const login = await fetch("/auth/loginSubmit", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify(creds),
                credentials: "include",
            });
            return { path: "login", status: login.status, ok: login.ok };
        }
        // Setup succeeded; follow with login to make sure the cookie is set.
        const login = await fetch("/auth/loginSubmit", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(creds),
            credentials: "include",
        });
        return { path: "setup+login", status: login.status, ok: login.ok };
    }, { email, password });
    if (!result.ok) throw new Error(`Auth failed (${result.path}): HTTP ${result.status}`);
}

async function setupAccountAndPage(page: Page, baseUrl: string) {
    await authenticate(page, baseUrl, "perf@test.local", "perf0123!");
    await openEditor(page, baseUrl);
}

async function openEditor(page: Page, baseUrl: string) {
    await page.goto(
        `${baseUrl}/cms/admin/editor?title=Perf+Test&identifier=perf-test&path=%2Fperf-test`,
        { waitUntil: "domcontentloaded" },
    );
    await page.waitForSelector("main p", { timeout: 10000 });
    await page.waitForTimeout(500);
}

async function runScenario(page: Page, scenario: Scenario): Promise<ScenarioResult> {
    const t0 = performance.now();
    let metrics: Record<string, number>;
    if (scenario.kind === "driver") {
        metrics = await scenario.run(page);
    } else {
        // Wrap the scenario (an arrow-function expression) so evaluate returns the metrics.
        metrics = await page.evaluate<Record<string, number>>(`(${scenario.run})()`);
    }
    return { name: scenario.name, metrics, durationMs: +(performance.now() - t0).toFixed(1) };
}

async function loadBaseline(): Promise<RunReport | null> {
    if (!existsSync(BASELINE_PATH)) return null;
    try { return JSON.parse(await readFile(BASELINE_PATH, "utf8")); }
    catch { return null; }
}

function compareToBaseline(current: RunReport, baseline: RunReport | null) {
    const baselineByName = new Map((baseline?.scenarios ?? []).map(s => [s.name, s.metrics]));
    const rows: Array<{ scenario: string; metric: string; current: number; base: number | null; ceiling: number | null; delta: string; flag: string }> = [];
    let regressionCount = 0;
    let improvementCount = 0;
    let absoluteFailCount = 0;
    for (const s of current.scenarios) {
        const base = baselineByName.get(s.name);
        const scenario = SCENARIOS.find(x => x.name === s.name);
        for (const [metric, value] of Object.entries(s.metrics)) {
            const baseVal = base?.[metric] ?? null;
            const ceiling = scenario?.absolutes?.[metric] ?? null;
            let delta = "";
            let flag = "";
            if (baseVal !== null && baseVal > 0) {
                const ratio = value / baseVal;
                const pct = (ratio - 1) * 100;
                delta = `${pct >= 0 ? "+" : ""}${pct.toFixed(1)}%`;
                const tol = scenario?.tolerances?.[metric] ?? DEFAULT_TOLERANCE;
                // Only flag regressions on latency metrics (ms). Counters and byte sizes
                // don't need tolerance treatment — they're either stable by design or
                // their drift means something structural.
                const isTiming = /Ms$/.test(metric);
                const absDelta = Math.abs(value - baseVal);
                if (isTiming && baseVal >= MIN_BASELINE_MS) {
                    if (ratio > 1 + tol && absDelta >= MIN_ABS_DELTA_MS) { flag = "REGRESSION"; regressionCount++; }
                    else if (ratio < 1 - tol && absDelta >= MIN_ABS_DELTA_MS) { flag = "improved"; improvementCount++; }
                }
            } else if (baseVal === null) {
                delta = "n/a";
                flag = "new";
            }
            // Absolute ceiling takes precedence over baseline delta — it's the
            // "common-sense sanity check" (e.g., inserting a <p> should never
            // take 30ms, even if the baseline agrees it does).
            if (ceiling !== null && value > ceiling) {
                flag = "ABSOLUTE-FAIL";
                absoluteFailCount++;
            }
            rows.push({ scenario: s.name, metric, current: value, base: baseVal, ceiling, delta, flag });
        }
    }
    return { rows, regressionCount, improvementCount, absoluteFailCount };
}

function printReport(current: RunReport, cmp: ReturnType<typeof compareToBaseline>) {
    console.log("\n=== Perf report ===");
    const colPad = (s: string, n: number) => s.padEnd(n);
    console.log(colPad("scenario", 26) + colPad("metric", 26) + colPad("current", 12) + colPad("baseline", 12) + colPad("ceiling", 10) + colPad("delta", 10) + "flag");
    console.log("-".repeat(106));
    for (const r of cmp.rows) {
        console.log(
            colPad(r.scenario, 26) +
            colPad(r.metric, 26) +
            colPad(String(r.current), 12) +
            colPad(r.base === null ? "—" : String(r.base), 12) +
            colPad(r.ceiling === null ? "—" : String(r.ceiling), 10) +
            colPad(r.delta, 10) +
            r.flag
        );
    }
    console.log("-".repeat(106));
    console.log(`Scenarios: ${current.scenarios.length}  |  Regressions: ${cmp.regressionCount}  |  Improvements: ${cmp.improvementCount}  |  Absolute fails: ${cmp.absoluteFailCount}`);
}

async function main() {
    const args = parseArgs();
    let server: PerfServer | null = null;
    let browser: Browser | null = null;
    try {
        console.log("• Starting perf server…");
        server = await startPerfServer();
        console.log(`  → ${server.baseUrl}`);

        console.log("• Launching chromium…");
        browser = await chromium.launch({ headless: !args.headed });
        const context = await browser.newContext();
        // Install a listener tracker BEFORE any page code runs. We monkey-patch
        // EventTarget.prototype.{add,remove}EventListener so every registration
        // made by the editor, its components, and the framework is counted.
        // The `listener-scan` scenario reads the totals back.
        await context.addInitScript(() => {
            const W = window as unknown as { __perfListeners?: unknown };
            if (W.__perfListeners) return;
            // Track unique (target, type, listener, capture) tuples. Browsers
            // dedupe registrations on those four, and removeEventListener on
            // an un-added combo is a no-op — we must mirror that semantics
            // or we over-decrement (the `remove-then-add` idiom is common).
            const byType = new Map<string, number>();
            const globalByType = new Map<string, number>();
            const perTarget = new WeakMap<object, Map<string, Set<unknown>>>();
            let winCount = 0, docCount = 0;
            const capFlag = (opts: unknown): boolean => {
                if (typeof opts === "boolean") return opts;
                if (opts && typeof opts === "object") return !!(opts as { capture?: boolean }).capture;
                return false;
            };
            const key = (type: string, listener: unknown, capture: boolean) =>
                type + "\x00" + (capture ? "1" : "0");
            const origAdd = EventTarget.prototype.addEventListener;
            const origRemove = EventTarget.prototype.removeEventListener;
            EventTarget.prototype.addEventListener = function (type: string, listener: any, opts?: any) {
                const cap = capFlag(opts);
                const k = key(type, listener, cap);
                let m = perTarget.get(this);
                if (!m) { m = new Map(); perTarget.set(this, m); }
                let set = m.get(k);
                if (!set) { set = new Set(); m.set(k, set); }
                if (!set.has(listener)) {
                    set.add(listener);
                    byType.set(type, (byType.get(type) ?? 0) + 1);
                    if (this === window) winCount++;
                    else if (this === document) docCount++;
                    if (this === window || this === document) {
                        globalByType.set(type, (globalByType.get(type) ?? 0) + 1);
                    }
                }
                return origAdd.call(this, type, listener, opts);
            };
            EventTarget.prototype.removeEventListener = function (type: string, listener: any, opts?: any) {
                const cap = capFlag(opts);
                const k = key(type, listener, cap);
                const m = perTarget.get(this);
                const set = m?.get(k);
                if (set && set.has(listener)) {
                    set.delete(listener);
                    byType.set(type, (byType.get(type) ?? 0) - 1);
                    if (this === window) winCount--;
                    else if (this === document) docCount--;
                    if (this === window || this === document) {
                        globalByType.set(type, (globalByType.get(type) ?? 0) - 1);
                    }
                }
                return origRemove.call(this, type, listener, opts);
            };
            W.__perfListeners = {
                total: () => Array.from(byType.values()).reduce((a, b) => a + b, 0),
                onWindow: () => winCount,
                onDocument: () => docCount,
                byType: () => {
                    const o: Record<string, number> = {};
                    for (const [k, v] of byType) if (v !== 0) o[k] = v;
                    return o;
                },
                globalByType: () => {
                    const o: Record<string, number> = {};
                    for (const [k, v] of globalByType) if (v !== 0) o[k] = v;
                    return o;
                },
            };
        });
        const page = await context.newPage();

        console.log("• Setting up account & editor page…");
        await setupAccountAndPage(page, server.baseUrl);

        const scenarios = args.only.length
            ? SCENARIOS.filter(s => args.only.includes(s.name))
            : SCENARIOS;

        const report: RunReport = { createdAt: new Date().toISOString(), scenarios: [] };
        // Warmup: run the first scenario once and discard, to absorb JIT / first-paint noise.
        if (scenarios.length > 0) {
            process.stdout.write(`• warmup (${scenarios[0].name})…`);
            const warm = await runScenario(page, scenarios[0]);
            console.log(` ${warm.durationMs} ms wall (discarded)`);
            await openEditor(page, server.baseUrl);
        }
        for (let i = 0; i < scenarios.length; i++) {
            const sc = scenarios[i];
            process.stdout.write(`• ${sc.name}…`);
            const res = await runScenario(page, sc);
            report.scenarios.push(res);
            console.log(` ${res.durationMs} ms wall`);
            // Isolate next scenario from this one's DOM/state.
            if (i < scenarios.length - 1) await openEditor(page, server.baseUrl);
        }

        const baseline = await loadBaseline();
        const cmp = compareToBaseline(report, baseline);
        printReport(report, cmp);

        if (args.save) {
            await mkdir(dirname(BASELINE_PATH), { recursive: true });
            await writeFile(BASELINE_PATH, JSON.stringify(report, null, 2));
            console.log(`\n✓ Baseline saved to ${BASELINE_PATH}`);
        } else if (!baseline) {
            console.log(`\n(no baseline yet — run with --save to record one)`);
        }

        if (cmp.regressionCount > 0 || cmp.absoluteFailCount > 0) process.exitCode = 1;
    } finally {
        if (browser) await browser.close();
        if (server) await server.stop();
    }
}

main()
    .then(() => process.exit(process.exitCode ?? 0))
    .catch(e => { console.error(e); process.exit(1); });
