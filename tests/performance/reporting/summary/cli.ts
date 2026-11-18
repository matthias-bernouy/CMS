import { createHash, randomUUID } from "node:crypto";
import { mkdir, readdir, writeFile } from "node:fs/promises";
import { join, relative, resolve, sep } from "node:path";
import { readRun } from "../history";
import { realDirectory } from "../storage/io";
import { summarizeRun } from "./model";
import { renderLatencySummary } from "./html";
import type { LatencySummary } from "./model";

const RUN_ID = /^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{8}$/u;

/** Derive a portable index without changing or silently ignoring corrupt input evidence. */
export async function writeLatencySummary(exportsRoot: string, destination: string) {
    exportsRoot = resolve(exportsRoot);
    destination = resolve(destination);
    if (destination === exportsRoot || destination.startsWith(`${exportsRoot}${sep}`)) {
        throw new Error("Derived summary must be outside immutable exports");
    }
    await realDirectory(exportsRoot);
    const entries = (await readdir(exportsRoot, { withFileTypes: true })).filter((entry) => RUN_ID.test(entry.name));
    if (!entries.length || entries.length > 1000 || entries.some((entry) => !entry.isDirectory())) {
        throw new Error("Summary requires between one and 1000 real exported run directories");
    }
    const generatedAt = new Date().toISOString();
    const directory = join(
        destination,
        `latencies-${generatedAt.replaceAll(/[^0-9TZ]/gu, "")}-${randomUUID().slice(0, 8)}`,
    );
    const runs: LatencySummary["runs"][number][] = [];
    const rows: LatencySummary["rows"][number][] = [];
    for (const entry of entries.toSorted((a, b) => a.name.localeCompare(b.name))) {
        await realDirectory(join(exportsRoot, entry.name));
        const report = await readRun(join(exportsRoot, entry.name, "runs"), entry.name);
        const link = relative(directory, join(exportsRoot, entry.name, "runs", entry.name, "report.html"))
            .split(sep)
            .map(encodeURIComponent)
            .join("/");
        const summary = summarizeRun(report, link);
        runs.push(summary.run);
        rows.push(...summary.rows);
        if (rows.length > 100_000) {
            throw new Error("Summary exceeds its scenario row bound");
        }
    }
    const summary: LatencySummary = {
        format: 1,
        generatedAt,
        percentileMethod:
            "nearest-rank over measurement samples including failed attempts; no pooling across scenarios or runs",
        integrity: "sealed-run-reports",
        runs,
        rows,
    };
    const json = `${JSON.stringify(summary)}\n`;
    const html = renderLatencySummary(summary);
    if (Buffer.byteLength(json) > 64 * 1024 ** 2 || Buffer.byteLength(html) > 64 * 1024 ** 2) {
        throw new Error("Summary exceeds its output byte bound");
    }
    await mkdir(destination, { recursive: true, mode: 0o700 });
    await realDirectory(destination);
    await mkdir(directory, { mode: 0o700 });
    const hash = (bytes: string) => createHash("sha256").update(bytes).digest("hex");
    await writeFile(join(directory, "latencies.json"), json, { flag: "wx", mode: 0o600 });
    await writeFile(join(directory, "index.html"), html, { flag: "wx", mode: 0o600 });
    const receipt = { format: 1, runs: runs.length, rows: rows.length, jsonSha256: hash(json), htmlSha256: hash(html) };
    await writeFile(join(directory, "complete.json"), `${JSON.stringify(receipt)}\n`, { flag: "wx", mode: 0o600 });
    return { directory, ...receipt };
}

if (import.meta.main) {
    const args = Bun.argv.slice(2);
    if (args.length !== 2) {
        throw new Error("Use cli.ts <immutable-exports-directory> <summary-output-directory>");
    }
    console.log(JSON.stringify(await writeLatencySummary(args[0]!, args[1]!)));
}
