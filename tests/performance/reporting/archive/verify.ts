import { createHash } from "node:crypto";
import { join, resolve } from "node:path";
import { readRun } from "../history";
import { referenceDigest } from "../storage/export";
import { realDirectory, regularBytes } from "../storage/io";
import { verifySourceSnapshot } from "./source";
import { assessmentCounts, referenceEligibility } from "./export";

/** Validate a transferred bundle, optionally against a previously pinned trusted run-seal digest. */
export async function verifyAssessmentExport(directory: string, expectedSeal?: string) {
    await realDirectory(directory);
    const proof = JSON.parse((await regularBytes(join(directory, "export.json"), 1024 ** 2)).toString());
    if (proof.format !== 1 || typeof proof.id !== "string" || !/^[a-f0-9]{64}$/u.test(proof.sourceDigest)) {
        throw new Error("Invalid assessment export identity");
    }
    const report = await readRun(join(directory, "runs"), proof.id);
    const snapshot = await verifySourceSnapshot(join(directory, "sources", proof.sourceDigest));
    const seal = await referenceDigest(join(directory, "runs"), proof.id);
    const manifest = await regularBytes(
        join(directory, "sources", proof.sourceDigest, "snapshot.json"),
        16 * 1024 ** 2,
    );
    const manifestSha = createHash("sha256").update(manifest).digest("hex");
    if (
        proof.sourceDigest !== report.metadata.sourceDigest ||
        snapshot.sourceDigest !== proof.sourceDigest ||
        proof.revision !== report.metadata.revision ||
        snapshot.revision !== proof.revision ||
        proof.sourceArchiveSha256 !== snapshot.archiveSha256 ||
        proof.sourceManifestSha256 !== manifestSha ||
        proof.sealSha256 !== seal ||
        (expectedSeal !== undefined && expectedSeal !== seal)
    ) {
        throw new Error("Assessment export seal or source identity mismatch");
    }
    const pin = report.metadata.sourceArchive;
    if (pin && (pin.archiveSha256 !== snapshot.archiveSha256 || pin.manifestSha256 !== manifestSha)) {
        throw new Error("Assessment source differs from its immutable report pin");
    }
    const counts = assessmentCounts(report);
    if (
        Object.entries(counts).some(([key, value]) => proof.results?.[key] !== value) ||
        (proof.sourceArchivePinVerified !== undefined && proof.sourceArchivePinVerified !== !!pin) ||
        proof.referenceEligible !== referenceEligibility(report, !!pin) ||
        JSON.stringify(proof.selection) !== JSON.stringify(report.metadata.selection)
    ) {
        throw new Error("Assessment export summary differs from its sealed evidence");
    }
    return {
        run: proof.id,
        verifiedFiles: snapshot.files,
        verifiedRunAndSourceSeals: true,
        sourceArchivePinVerified: !!pin,
        referenceEligible: proof.referenceEligible,
        sealSha256: seal,
    };
}

if (import.meta.main) {
    const [directory, expectedSeal] = Bun.argv.slice(2);
    if (!directory) {
        throw new Error("Use verify.ts <export-directory> [expected-run-seal-sha256]");
    }
    console.log(JSON.stringify(await verifyAssessmentExport(resolve(directory), expectedSeal)));
}
