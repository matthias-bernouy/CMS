import { array, assertEqual, boolean, canonicalText, digest, enumValue, exactObject } from "../../helpers";
import type { CandidateReportIdentity } from "./shared";
import { versionReference } from "./shared";

const OUTCOMES = ["compatible", "breaking", "unknown", "invalid", "not-applicable"] as const;
const CLASSIFICATIONS = ["compatible", "additive", "breaking", "unknown", "invalid"] as const;
const SURFACES = ["definition", "input", "dependency", "artifact", "schema", "function"] as const;
const RELEASE_LEVELS = ["initial", "patch", "minor", "major"] as const;
const REQUIRED_LEVELS = ["none", "patch", "minor", "major"] as const;

export function validateCandidateCompatibility(value: unknown, identity: CandidateReportIdentity): void {
    const report = exactObject(value, [
        "kind",
        "version",
        "packageDigest",
        "outcome",
        "contractAdmissible",
        "releaseLevel",
        "requiredReleaseLevel",
        "baselines",
        "informationalBaselines",
        "findings",
    ]);
    assertEqual(report.kind, identity.kind);
    assertEqual(report.version, identity.version);
    assertEqual(report.packageDigest, identity.packageDigest);
    enumValue(report.outcome, OUTCOMES);
    boolean(report.contractAdmissible);
    enumValue(report.releaseLevel, RELEASE_LEVELS);
    enumValue(report.requiredReleaseLevel, REQUIRED_LEVELS);
    const baselines = validateBaselines(report.baselines, identity.kind, 256);
    const informational = validateBaselines(report.informationalBaselines, identity.kind, 1);
    const baselineDigests = new Set([...baselines, ...informational, identity.packageDigest]);
    array(report.findings).forEach((finding) => validateFinding(finding, identity.packageDigest, baselineDigests));
}

function validateBaselines(value: unknown, kind: string, maximum: number): readonly string[] {
    const keys = array(value, maximum).map((entry) => {
        const reference = versionReference(entry);
        assertEqual(reference.kind, kind);
        return `${reference.version}:${reference.packageDigest}`;
    });
    if (new Set(keys).size !== keys.length) {
        throw new TypeError("Repository candidate compatibility baselines are duplicated");
    }
    return keys.map((key) => key.slice(key.indexOf(":") + 1));
}

function validateFinding(value: unknown, candidatePackageDigest: string, baselineDigests: ReadonlySet<string>): void {
    const finding = exactObject(value, [
        "findingId",
        "classification",
        "surface",
        "path",
        "code",
        "message",
        "baselineDigest",
        "candidateDigest",
    ]);
    canonicalText(finding.findingId, 512);
    enumValue(finding.classification, CLASSIFICATIONS);
    enumValue(finding.surface, SURFACES);
    canonicalText(finding.path, 4_096);
    canonicalText(finding.code, 512);
    canonicalText(finding.message, 16_384);
    if (!baselineDigests.has(digest(finding.baselineDigest))) {
        throw new TypeError("Repository candidate finding substitutes its compatibility baseline");
    }
    assertEqual(digest(finding.candidateDigest), candidatePackageDigest);
}
