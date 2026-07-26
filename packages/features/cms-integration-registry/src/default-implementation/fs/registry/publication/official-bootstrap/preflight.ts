import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { identifyOfficialRepositoryBootstrapPlan } from "../../../../../core/publication/bootstrapPlan";
import type { OfficialRepositoryBootstrapPlan } from "../../../../../interfaces/publication";
import { FsReviewedSchemaBaselineStore } from "../../baselines/store";
import { prepareFsOfficialBootstrapCandidate, type PreparedFsIntegrationRegistryCandidate } from "../candidate";
import { evaluatePublicationCompatibility } from "../compatibility";
import { nextIntegrationRegistryIndex } from "../index";
import { validateBootstrapBaselines } from "./baselines";
import { preflightStoredBootstrapBaselines } from "./storedBaselines";
import type {
    FsOfficialIntegrationRegistryBootstrapPublisherConfig,
    PreflightedOfficialBootstrap,
    PreflightedOfficialBootstrapPackage,
    PreparedFsOfficialIntegrationRegistryBootstrap,
} from "./types";
import { PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA } from "./types";

export async function preflightOfficialBootstrapPlan(
    config: FsOfficialIntegrationRegistryBootstrapPublisherConfig,
    plan: OfficialRepositoryBootstrapPlan,
): Promise<PreflightedOfficialBootstrap> {
    const identified = await identifyOfficialRepositoryBootstrapPlan(plan);
    if (identified.plan.packages.length === 0) {
        throw new TypeError("Official integration registry bootstrap requires at least one package");
    }
    const packages: PreparedFsIntegrationRegistryCandidate[] = [];
    const packagesByKind = new Map<string, PreparedFsIntegrationRegistryCandidate>();
    for (const entry of identified.plan.packages) {
        const resolved = {
            envelope: entry.package.envelope,
            canonicalBytes: canonicalJsonBytes(entry.package.envelope),
            digest: entry.package.digest,
        };
        const candidate = await prepareFsOfficialBootstrapCandidate(
            resolved,
            config.packageLimits,
            entry.anonymousConstraintGrandfathering,
        );
        if (packagesByKind.has(candidate.definition.kind)) {
            throw new TypeError("Official integration registry bootstrap accepts one initial version per kind");
        }
        nextIntegrationRegistryIndex(null, candidate.definition, candidate.package.envelope);
        packagesByKind.set(candidate.definition.kind, candidate);
        packages.push(candidate);
    }
    await validateBootstrapBaselines(identified.plan, packages, config.baselineApproval);
    const existingKinds = validateCatalogSubset(config, packagesByKind);
    const prepared: PreflightedOfficialBootstrapPackage[] = [];
    for (const candidate of packages) {
        prepared.push({
            candidate,
            ...(existingKinds.has(candidate.definition.kind)
                ? {}
                : {
                      report: await evaluatePublicationCompatibility(
                          config.snapshots.current(),
                          candidate,
                          config.compatibility,
                      ),
                  }),
        });
    }
    await preflightStoredBootstrapBaselines(
        config.baselineStore ?? new FsReviewedSchemaBaselineStore({ root: config.root }),
        identified.plan,
        existingKinds,
    );
    return Object.freeze({ planDigest: identified.digest, plan: identified.plan, packages: Object.freeze(prepared) });
}

export function hydratePreparedOfficialBootstrap(
    preparation: PreparedFsOfficialIntegrationRegistryBootstrap,
): OfficialRepositoryBootstrapPlan {
    assertPreparedShape(preparation);
    return {
        schema: preparation.plan.schema,
        packages: preparation.plan.packages.map((entry) => ({
            package: {
                envelope: entry.package.envelope,
                canonicalBytes: canonicalJsonBytes(entry.package.envelope),
                digest: entry.package.digest,
            },
            anonymousConstraintGrandfathering: entry.anonymousConstraintGrandfathering,
        })),
        reviewedSchemaBaselines: preparation.plan.reviewedSchemaBaselines,
    };
}

function validateCatalogSubset(
    config: FsOfficialIntegrationRegistryBootstrapPublisherConfig,
    packagesByKind: ReadonlyMap<string, PreparedFsIntegrationRegistryCandidate>,
): ReadonlySet<string> {
    const snapshot = config.snapshots.current();
    if (snapshot.diagnostics.length > 0 || snapshot.quarantined.length > 0) {
        throw new Error("Official integration registry bootstrap requires a healthy catalog snapshot");
    }
    const existingKinds = new Set<string>();
    for (const summary of snapshot.summaries) {
        const candidate = packagesByKind.get(summary.kind);
        const index = snapshot.getIndex(summary.kind);
        if (!candidate || !index || snapshot.listVersions(summary.kind).length !== 1) {
            throw new Error("Official integration registry bootstrap catalog contains state outside the exact plan");
        }
        const version = candidate.package.envelope.version;
        const location = snapshot.locateExactVersion(summary.kind, version);
        const expectedIndex = nextIntegrationRegistryIndex(null, candidate.definition, candidate.package.envelope);
        if (
            !location ||
            location.package.digest !== candidate.package.digest ||
            !equalBytes(canonicalJsonBytes(index), canonicalJsonBytes(expectedIndex))
        ) {
            throw new Error("Official integration registry bootstrap catalog diverges from the exact plan");
        }
        existingKinds.add(summary.kind);
    }
    return existingKinds;
}

function assertPreparedShape(value: PreparedFsOfficialIntegrationRegistryBootstrap): void {
    const expected = ["baselineCount", "packageCount", "pendingPackageCount", "plan", "planDigest", "schema"];
    const keys = Object.keys(value);
    if (
        keys.length !== expected.length ||
        !expected.every((key) => keys.includes(key)) ||
        value.schema !== PREPARED_OFFICIAL_BOOTSTRAP_SCHEMA ||
        !/^[a-f0-9]{64}$/u.test(value.planDigest) ||
        !Number.isSafeInteger(value.packageCount) ||
        value.packageCount < 1 ||
        !Number.isSafeInteger(value.pendingPackageCount) ||
        value.pendingPackageCount < 0 ||
        value.pendingPackageCount > value.packageCount ||
        !Number.isSafeInteger(value.baselineCount) ||
        value.baselineCount < 0
    ) {
        throw new TypeError("Official integration registry bootstrap preparation is invalid");
    }
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
