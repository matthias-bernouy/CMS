import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import { renderReport } from "./html";
import { realDirectory, regularBytes } from "./storage/io";
import type { Comparison, RunReport } from "./types";

const MAX_REPORT_BYTES = 128 * 1024 * 1024;
const RUN_ID = /^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{8}$/u;
const hash = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

export async function writeRun(root: string, report: RunReport, comparison?: Comparison): Promise<string> {
    if (!RUN_ID.test(report.metadata.id)) {
        throw new Error("Invalid performance run ID");
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    await realDirectory(root);
    const path = join(root, report.metadata.id);
    await mkdir(path, { mode: 0o700 });
    const json = `${JSON.stringify(report, null, 2)}\n`;
    const html = renderReport(report, comparison);
    if (Buffer.byteLength(json) > MAX_REPORT_BYTES || Buffer.byteLength(html) > MAX_REPORT_BYTES) {
        throw new Error("Performance report exceeds its byte limit");
    }
    await writeFile(join(path, "results.json"), json, { flag: "wx", mode: 0o600 });
    await writeFile(join(path, "report.html"), html, { flag: "wx", mode: 0o600 });
    const comparisonJson = comparison ? `${JSON.stringify(comparison, null, 2)}\n` : null;
    if (comparisonJson) {
        await writeFile(join(path, "comparison.json"), comparisonJson, {
            flag: "wx",
            mode: 0o600,
        });
    }
    // Written last. An interrupted report is never eligible as a comparison reference.
    await writeFile(
        join(path, "complete.json"),
        `${JSON.stringify({ id: report.metadata.id, status: report.status, revision: report.metadata.revision, finishedAt: report.metadata.finishedAt, resultsSha256: hash(json), htmlSha256: hash(html), comparisonSha256: comparisonJson ? hash(comparisonJson) : null })}\n`,
        { flag: "wx", mode: 0o600 },
    );
    return path;
}

export async function readRun(root: string, id: string): Promise<RunReport> {
    if (!RUN_ID.test(id)) {
        throw new Error("Invalid performance run ID");
    }
    await realDirectory(root);
    const path = join(root, id);
    await realDirectory(path);
    const seal = parseStrictJson(await regularBytes(join(path, "complete.json"), 4096), 4096, 4) as Record<
        string,
        unknown
    >;
    const json = await regularBytes(join(path, "results.json"), MAX_REPORT_BYTES);
    const html = await regularBytes(join(path, "report.html"), MAX_REPORT_BYTES);
    if (seal.id !== id || seal.resultsSha256 !== hash(json) || seal.htmlSha256 !== hash(html)) {
        throw new Error("Performance history integrity mismatch");
    }
    if (seal.comparisonSha256 !== null) {
        const comparison = await regularBytes(join(path, "comparison.json"), MAX_REPORT_BYTES);
        if (seal.comparisonSha256 !== hash(comparison)) {
            throw new Error("Performance comparison integrity mismatch");
        }
    }
    const report = parseStrictJson(json, MAX_REPORT_BYTES, 64) as RunReport;
    if (
        report.format !== 1 ||
        report.metadata?.id !== id ||
        !Array.isArray(report.results) ||
        !Array.isArray(report.scenarios) ||
        !Array.isArray(report.findings) ||
        !Array.isArray(report.coverage) ||
        !Array.isArray(report.inventory?.targets)
    ) {
        throw new Error("Invalid performance report");
    }
    return report;
}
