import { mkdir } from "node:fs/promises";
import { join, resolve } from "node:path";
import { createHash } from "node:crypto";
import { compatibilityCatalogue } from "./inventory";
import { exclusiveJson, realDirectory } from "../reporting/storage/io";
import { sourceProvenance, runId } from "../harness/measurements/provenance";
import { captureSourceSnapshot } from "../reporting/archive/source";

/** Static compatibility evidence is recorded separately and never counted as measured performance. */
export async function checkCompatibility() {
    const root = resolve(import.meta.dir, "../../..");
    const source = await sourceProvenance(root);
    const snapshot = await captureSourceSnapshot(root, undefined, source);
    let result;
    try {
        const proof = await compatibilityCatalogue();
        result = {
            status: "passed" as const,
            executorFingerprint: proof.performance.fingerprint,
            executors: proof.performance.targets.length,
            retainedClaims: proof.retainedClaims,
            mappings: proof.mappings,
            findings: [] as string[],
        };
    } catch {
        result = {
            status: "failed" as const,
            findings: ["Retained metadata could not be admitted against captured executor code"],
        };
    }
    if ((await sourceProvenance(root)).sourceDigest !== source.sourceDigest) {
        result.status = "failed";
        result.findings.push("Source changed during the compatibility check");
    }
    const id = runId(source.revision);
    const parent = join(root, "artifacts/performance/compatibility");
    await mkdir(parent, { recursive: true, mode: 0o700 });
    await realDirectory(parent);
    const directory = join(parent, id);
    await mkdir(directory, { mode: 0o700 });
    const bytes = await exclusiveJson(join(directory, "results.json"), {
        format: 1,
        id,
        checkedAt: new Date().toISOString(),
        ...source,
        sourceArchive: { archiveSha256: snapshot.archiveSha256, manifestSha256: snapshot.manifestSha256 },
        ...result,
        measuredPerformance: false,
    });
    await exclusiveJson(join(directory, "complete.json"), {
        id,
        status: result.status,
        resultsSha256: createHash("sha256").update(bytes).digest("hex"),
    });
    console.log(JSON.stringify({ path: directory, status: result.status, measuredPerformance: false }));
    return { directory, ...result };
}

if (import.meta.main && (await checkCompatibility()).status !== "passed") {
    process.exitCode = 1;
}
