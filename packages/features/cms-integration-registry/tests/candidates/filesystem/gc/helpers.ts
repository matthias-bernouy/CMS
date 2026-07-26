import { chmodSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";

export function rewriteInitialRecordAsLegacyV1(root: string, candidateId: string): void {
    const path = join(root, ".registry", "candidates", "records", candidateId, "0000000000000000.json");
    const current = JSON.parse(readFileSync(path, "utf8")) as Record<string, unknown>;
    current.schema = "cms.integration.registry.candidate-record.v1";
    delete current.candidateDigest;
    delete current.policyDigest;
    delete current.admissionInputDigest;
    delete current.verificationJobResultDigest;
    chmodSync(path, 0o640);
    writeFileSync(path, canonicalJsonBytes(current));
}

export function objectEntries(root: string, kind: string): string[] {
    return readdirSync(join(root, ".registry", "candidates", "objects", kind));
}

export function objectPath(root: string, kind: string, digest: string): string {
    return join(root, ".registry", "candidates", "objects", kind, `${digest}.json`);
}
