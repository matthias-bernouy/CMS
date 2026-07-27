import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import {
    buildIntegrationVerificationSuiteContent,
    computeIntegrationVerificationDigest,
    computeIntegrationVerificationSuiteContentDigest,
} from "@bernouy/cms-integration-verification";
import { readContractLineageHistory } from "./history";
import { listContractLineageHistories } from "./layout";
import type { FsIntegrationVerificationContractCatalogConfig } from "./types";

export async function resolveActiveVerificationContracts(
    config: FsIntegrationVerificationContractCatalogConfig,
    kind: string,
    targetVersion: string,
) {
    assertIntegrationPackageKind(kind);
    assertIntegrationPackageVersion(targetVersion);
    const inherited = [];
    const snapshot = config.snapshots.current();
    for (const historyPath of await listContractLineageHistories(config.root, kind)) {
        const history = await readContractLineageHistory(historyPath);
        const active = [];
        for (const revision of history.revisions) {
            if (!integrationVersionSatisfies(targetVersion, revision.activeMajorRange)) {
                continue;
            }
            const resolved = await resolveCommittedRevision(config, snapshot, kind, revision);
            if (resolved) {
                active.push(resolved);
            }
        }
        if (active.length > 1) {
            throw new Error(`Verification contract ${history.key.contractId} has overlapping active revisions`);
        }
        if (active[0]) {
            inherited.push(active[0]);
        }
    }
    return Object.freeze(
        inherited.toSorted((left, right) => left.reference.contractId.localeCompare(right.reference.contractId)),
    );
}

async function resolveCommittedRevision(
    config: FsIntegrationVerificationContractCatalogConfig,
    snapshot: ReturnType<FsIntegrationVerificationContractCatalogConfig["snapshots"]["current"]>,
    kind: string,
    revision: Awaited<ReturnType<typeof readContractLineageHistory>>["revisions"][number],
) {
    const entry = snapshot.getIndex(kind)?.versions.find((candidate) => candidate.version === revision.ownerVersion);
    const location = snapshot.locateExactVersion(kind, revision.ownerVersion);
    if (!entry || !location || location.package.digest !== revision.ownerPackageDigest) {
        throw new Error(`Verification contract ${revision.contractId} owner package is absent or substituted`);
    }
    if (entry.status === "unverified") {
        return null;
    }
    if (entry.verificationDigest !== revision.ownerVerificationDigest) {
        throw new Error(`Verification contract ${revision.contractId} owner verification is substituted`);
    }
    const stored = await config.bundles.get(revision.ownerVerificationDigest);
    if (
        !stored ||
        stored.digest !== revision.ownerVerificationDigest ||
        (await computeIntegrationVerificationDigest(stored.envelope)) !== revision.ownerVerificationDigest ||
        stored.envelope.target.kind !== kind ||
        stored.envelope.target.version !== revision.ownerVersion ||
        stored.envelope.target.packageDigest !== revision.ownerPackageDigest
    ) {
        throw new Error(`Verification contract ${revision.contractId} owner bundle is unavailable`);
    }
    const content = await buildIntegrationVerificationSuiteContent(stored.envelope, "contract", revision.contractId);
    const contentDigest = await computeIntegrationVerificationSuiteContentDigest(
        stored.envelope,
        "contract",
        revision.contractId,
    );
    if (
        content.suite.entrypoint !== revision.entrypoint ||
        ("activeMajorRange" in content.suite && content.suite.activeMajorRange !== revision.activeMajorRange) ||
        contentDigest !== revision.contractDigest
    ) {
        throw new Error(`Verification contract ${revision.contractId} source closure is substituted`);
    }
    return {
        reference: {
            contractId: revision.contractId,
            lineageId: revision.lineageId,
            ownerVersion: revision.ownerVersion,
            contractDigest: revision.contractDigest,
        },
        suite: {
            suiteId: revision.contractId,
            source: "author-contract" as const,
            contentDigest: revision.contractDigest,
        },
        ownerPackageDigest: revision.ownerPackageDigest,
        ownerVerificationDigest: revision.ownerVerificationDigest,
        content,
    };
}
