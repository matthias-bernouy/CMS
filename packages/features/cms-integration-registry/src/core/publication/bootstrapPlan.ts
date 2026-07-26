import {
    assertIntegrationPackagePath,
    canonicalJsonBytes,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";
import { identifyReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import type {
    IdentifiedOfficialRepositoryBootstrapPlan,
    OfficialBootstrapAnonymousConstraintGrandfathering,
    OfficialRepositoryBootstrapPlan,
    OfficialRepositoryBootstrapPlanProjection,
    OfficialRepositoryBootstrapProjectedPackage,
} from "../../interfaces/publication";
import { OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA } from "../../interfaces/publication";

const MAX_BOOTSTRAP_PACKAGES = 4_096;
const MAX_BOOTSTRAP_BASELINES = 4_096;

export async function identifyOfficialRepositoryBootstrapPlan(
    value: OfficialRepositoryBootstrapPlan,
): Promise<IdentifiedOfficialRepositoryBootstrapPlan> {
    assertExactKeys(value, ["packages", "reviewedSchemaBaselines", "schema"], "bootstrap plan");
    if (value.schema !== OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA) {
        throw new TypeError(`Official bootstrap plan schema must be ${OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA}`);
    }
    assertBoundedArray(value.packages, MAX_BOOTSTRAP_PACKAGES, "packages");
    assertBoundedArray(value.reviewedSchemaBaselines, MAX_BOOTSTRAP_BASELINES, "reviewed schema baselines");
    const packages = await Promise.all(value.packages.map(projectPackage));
    const baselines = await Promise.all(
        value.reviewedSchemaBaselines.map(
            async (baseline) => (await identifyReviewedSchemaBaseline(baseline)).baseline,
        ),
    );
    const plan: OfficialRepositoryBootstrapPlanProjection = {
        schema: OFFICIAL_REPOSITORY_BOOTSTRAP_PLAN_SCHEMA,
        packages: packages.sort(comparePackages),
        reviewedSchemaBaselines: baselines.sort(compareBaselines),
    };
    const canonicalBytes = canonicalJsonBytes(plan);
    return Object.freeze({ plan, canonicalBytes, digest: await sha256Hex(canonicalBytes) });
}

async function projectPackage(
    entry: OfficialRepositoryBootstrapPlan["packages"][number],
): Promise<OfficialRepositoryBootstrapProjectedPackage> {
    assertExactKeys(entry, ["anonymousConstraintGrandfathering", "package"], "bootstrap package");
    assertExactKeys(entry.package, ["canonicalBytes", "digest", "envelope"], "resolved bootstrap package");
    assertBoundedArray(entry.anonymousConstraintGrandfathering, 4_096, "anonymous constraint grandfathering");
    const envelope = validateIntegrationPackageEnvelope(entry.package.envelope, { requireReleaseNotes: true });
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (!equalBytes(canonicalBytes, entry.package.canonicalBytes)) {
        throw new TypeError("Official bootstrap package bytes are not canonical");
    }
    if ((await sha256Hex(canonicalBytes)) !== entry.package.digest) {
        throw new TypeError("Official bootstrap package digest does not match its canonical envelope");
    }
    return Object.freeze({
        package: Object.freeze({ digest: entry.package.digest, envelope }),
        anonymousConstraintGrandfathering: Object.freeze(
            entry.anonymousConstraintGrandfathering.map(projectGrandfathering).sort(compareGrandfathering),
        ),
    });
}

function projectGrandfathering(
    entry: OfficialBootstrapAnonymousConstraintGrandfathering,
): OfficialBootstrapAnonymousConstraintGrandfathering {
    assertExactKeys(entry, ["findings", "packageDigest", "path"], "anonymous constraint grandfathering");
    if (!/^[a-f0-9]{64}$/u.test(entry.packageDigest) || typeof entry.path !== "string") {
        throw new TypeError("Official bootstrap anonymous constraint grandfathering identity is invalid");
    }
    assertIntegrationPackagePath(entry.path);
    assertBoundedArray(entry.findings, 4_096, "anonymous constraint findings");
    return Object.freeze({
        packageDigest: entry.packageDigest,
        path: entry.path,
        findings: Object.freeze(
            entry.findings
                .map((finding) => {
                    assertExactKeys(finding, ["column", "kind", "line", "path"], "anonymous constraint finding");
                    if (
                        finding.path !== entry.path ||
                        !Number.isSafeInteger(finding.line) ||
                        finding.line < 1 ||
                        !Number.isSafeInteger(finding.column) ||
                        finding.column < 1 ||
                        (finding.kind !== "anonymous-check" && finding.kind !== "anonymous-unique")
                    ) {
                        throw new TypeError("Official bootstrap anonymous constraint finding is invalid");
                    }
                    assertIntegrationPackagePath(finding.path);
                    return Object.freeze({ ...finding });
                })
                .sort(compareFindings),
        ),
    });
}

function assertExactKeys(value: unknown, expected: readonly string[], label: string): asserts value is object {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError(`Official ${label} must be an object`);
    }
    const keys = Object.keys(value);
    if (keys.length !== expected.length || !expected.every((key) => keys.includes(key))) {
        throw new TypeError(`Official ${label} has an invalid closed schema`);
    }
}

function assertBoundedArray(value: unknown, limit: number, label: string): asserts value is readonly unknown[] {
    if (!Array.isArray(value) || value.length > limit) {
        throw new TypeError(`Official bootstrap ${label} must be an array of at most ${limit} entries`);
    }
}

function comparePackages(
    left: OfficialRepositoryBootstrapProjectedPackage,
    right: OfficialRepositoryBootstrapProjectedPackage,
) {
    return (
        compareText(left.package.envelope.kind, right.package.envelope.kind) ||
        compareText(left.package.envelope.version, right.package.envelope.version) ||
        compareText(left.package.digest, right.package.digest)
    );
}

function compareBaselines(
    left: OfficialRepositoryBootstrapPlan["reviewedSchemaBaselines"][number],
    right: OfficialRepositoryBootstrapPlan["reviewedSchemaBaselines"][number],
): number {
    return (
        compareText(left.kind, right.kind) ||
        compareText(left.version, right.version) ||
        compareText(left.connectorKey, right.connectorKey) ||
        compareText(left.lineageId, right.lineageId) ||
        compareText(left.reportId, right.reportId)
    );
}

function compareGrandfathering(
    left: OfficialBootstrapAnonymousConstraintGrandfathering,
    right: OfficialBootstrapAnonymousConstraintGrandfathering,
): number {
    return compareText(left.packageDigest, right.packageDigest) || compareText(left.path, right.path);
}

function compareFindings(
    left: OfficialBootstrapAnonymousConstraintGrandfathering["findings"][number],
    right: OfficialBootstrapAnonymousConstraintGrandfathering["findings"][number],
): number {
    return (
        compareText(left.path, right.path) ||
        left.line - right.line ||
        left.column - right.column ||
        compareText(left.kind, right.kind)
    );
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
