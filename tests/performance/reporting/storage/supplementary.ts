import { createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { cpus, totalmem } from "node:os";
import { join, resolve } from "node:path";
import { runId, sourceProvenance } from "../../harness/measurements/provenance";
import { realDirectory, regularBytes } from "./io";

const LIMIT = 32 * 1024 * 1024;
const ROOT = resolve(import.meta.dir, "../../../../artifacts/performance/supplementary");
const ID = /^\d{8}T\d{6}Z-[a-f0-9]{7,40}-[a-f0-9]{8}$/u;
const digest = (bytes: string | Uint8Array) => createHash("sha256").update(bytes).digest("hex");

/** Supplementary benchmarks never contribute capability execution coverage. Context must contain no secrets. */
export async function beginSupplementary(kind: "benchmarks" | "repository" | "delivery", context: unknown = {}) {
    const source = await sourceProvenance();
    return {
        format: "ulvia.performance.supplementary.v1" as const,
        kind,
        metadata: {
            id: runId(source.revision),
            startedAt: new Date().toISOString(),
            ...source,
            environment: {
                bun: Bun.version,
                platform: process.platform,
                architecture: process.arch,
                cpuModel: cpus()[0]?.model ?? "unknown",
                cpuCount: cpus().length,
                memoryBytes: totalmem(),
            },
        },
        context,
    };
}

export type SupplementaryStart = Awaited<ReturnType<typeof beginSupplementary>>;

export async function writeSupplementary(
    start: SupplementaryStart,
    results: unknown,
    status: "passed" | "failed",
    root = ROOT,
) {
    if (!ID.test(start.metadata.id)) {
        throw new Error("Invalid supplementary run ID");
    }
    const finishedSource = await sourceProvenance();
    const report = {
        ...start,
        metadata: { ...start.metadata, finishedAt: new Date().toISOString() },
        status,
        sourceChanged: finishedSource.sourceDigest !== start.metadata.sourceDigest,
        results,
    };
    const json = `${JSON.stringify(
        report,
        (_key, value) => {
            if (typeof value === "number" && !Number.isFinite(value)) {
                throw new Error("Non-finite supplementary metric");
            }
            return value;
        },
        2,
    )}\n`;
    const escaped = json.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const html = `<!doctype html><meta charset="utf-8"><title>${start.kind} performance</title><style>body{font:16px system-ui;max-width:1000px;margin:40px auto;padding:20px}pre{white-space:pre-wrap;overflow-wrap:anywhere}</style><h1>${start.kind} performance — ${status}</h1><p>Supplementary evidence; no capability coverage credit.</p><pre>${escaped}</pre>`;
    if (Buffer.byteLength(json) > LIMIT || Buffer.byteLength(html) > LIMIT) {
        throw new Error("Supplementary report exceeds its byte limit");
    }
    await mkdir(root, { recursive: true, mode: 0o700 });
    await realDirectory(root);
    const path = join(root, start.metadata.id);
    await mkdir(path, { mode: 0o700 });
    await writeFile(join(path, "results.json"), json, { flag: "wx", mode: 0o600 });
    await writeFile(join(path, "report.html"), html, { flag: "wx", mode: 0o600 });
    await writeFile(
        join(path, "complete.json"),
        JSON.stringify({ id: start.metadata.id, resultsSha256: digest(json), htmlSha256: digest(html) }),
        { flag: "wx", mode: 0o600 },
    );
    return path;
}

export async function readSupplementary(root: string, id: string) {
    if (!ID.test(id)) {
        throw new Error("Invalid supplementary run ID");
    }
    await realDirectory(root);
    const path = join(root, id);
    await realDirectory(path);
    const seal = JSON.parse((await regularBytes(join(path, "complete.json"), 4096)).toString());
    const json = await regularBytes(join(path, "results.json"), LIMIT);
    const html = await regularBytes(join(path, "report.html"), LIMIT);
    if (seal.id !== id || seal.resultsSha256 !== digest(json) || seal.htmlSha256 !== digest(html)) {
        throw new Error("Supplementary history integrity mismatch");
    }
    const report = JSON.parse(json.toString());
    if (report.format !== "ulvia.performance.supplementary.v1" || report.metadata?.id !== id) {
        throw new Error("Invalid supplementary report");
    }
    return report;
}
