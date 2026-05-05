/**
 * Runs the perf suite N times, drops the min & max per metric (outliers),
 * and writes the averaged report to baseline.json.
 *
 * Usage: bun run tests/perf/aggregate.ts [--runs=10]
 */

import { spawn } from "node:child_process";
import { readFile, writeFile, rename, mkdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

const BASELINE_PATH = resolve(import.meta.dir, "baseline.json");
const TMP_DIR = resolve(import.meta.dir, ".aggregate-tmp");

type ScenarioResult = { name: string; metrics: Record<string, number>; durationMs: number };
type RunReport = { createdAt: string; scenarios: ScenarioResult[] };

function parseArgs() {
    const argv = process.argv.slice(2);
    const runsArg = argv.find(a => a.startsWith("--runs="));
    return { runs: runsArg ? parseInt(runsArg.slice("--runs=".length), 10) : 10 };
}

function runOnce(): Promise<RunReport> {
    return new Promise((resolvePromise, rejectPromise) => {
        const child = spawn("bun", ["run", resolve(import.meta.dir, "run.ts"), "--save"], {
            stdio: ["ignore", "inherit", "inherit"],
            cwd: resolve(import.meta.dir, "../.."),
        });
        child.on("exit", async (code) => {
            // Exit code 1 is OK (it just means there were regressions vs the previous baseline).
            if (code !== 0 && code !== 1) {
                rejectPromise(new Error(`perf run exited with code ${code}`));
                return;
            }
            try {
                const report = JSON.parse(await readFile(BASELINE_PATH, "utf8")) as RunReport;
                resolvePromise(report);
            } catch (e) { rejectPromise(e as Error); }
        });
        child.on("error", rejectPromise);
    });
}

function aggregate(reports: RunReport[]): RunReport {
    // Use the first run's structure as the template.
    const template = reports[0];
    const out: RunReport = {
        createdAt: new Date().toISOString(),
        scenarios: template.scenarios.map(s => ({
            name: s.name,
            metrics: {},
            durationMs: 0,
        })),
    };

    for (let i = 0; i < template.scenarios.length; i++) {
        const name = template.scenarios[i].name;
        const allForScenario = reports
            .map(r => r.scenarios.find(s => s.name === name))
            .filter((x): x is ScenarioResult => !!x);

        const metricNames = new Set<string>();
        for (const s of allForScenario) for (const k of Object.keys(s.metrics)) metricNames.add(k);

        for (const m of metricNames) {
            const values = allForScenario
                .map(s => s.metrics[m])
                .filter((v): v is number => typeof v === "number" && Number.isFinite(v))
                .sort((a, b) => a - b);
            if (values.length === 0) continue;
            // Drop the single lowest and single highest as outliers (when we have enough samples).
            const trimmed = values.length >= 4 ? values.slice(1, -1) : values;
            const avg = trimmed.reduce((a, b) => a + b, 0) / trimmed.length;
            // Preserve a sensible number of decimals (1dp for ms-like, 0dp for integer counters).
            const looksInt = trimmed.every(v => Number.isInteger(v));
            out.scenarios[i].metrics[m] = looksInt ? Math.round(avg) : +avg.toFixed(2);
        }

        const durations = allForScenario.map(s => s.durationMs).sort((a, b) => a - b);
        const trimmedDur = durations.length >= 4 ? durations.slice(1, -1) : durations;
        out.scenarios[i].durationMs = +(trimmedDur.reduce((a, b) => a + b, 0) / trimmedDur.length).toFixed(1);
    }
    return out;
}

async function main() {
    const { runs } = parseArgs();
    console.log(`• Running perf suite ${runs} times (will drop min/max per metric)…`);

    await mkdir(TMP_DIR, { recursive: true });
    const reports: RunReport[] = [];
    for (let i = 0; i < runs; i++) {
        console.log(`\n=== Run ${i + 1}/${runs} ===`);
        const report = await runOnce();
        reports.push(report);
        // Keep each raw run for debugging.
        await writeFile(resolve(TMP_DIR, `run-${i + 1}.json`), JSON.stringify(report, null, 2));
    }

    const aggregated = aggregate(reports);
    await writeFile(BASELINE_PATH, JSON.stringify(aggregated, null, 2));
    console.log(`\n✓ Aggregated baseline written to ${BASELINE_PATH}`);
    console.log(`  (raw runs kept in ${TMP_DIR}/)`);
}

main().catch(e => { console.error(e); process.exit(1); });
