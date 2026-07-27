import { join } from "node:path";
import {
    computeIntegrationVerificationDigest,
    computeIntegrationVerificationSuiteContentDigest,
} from "@bernouy/cms-integration-verification";
import { integrationVersionSatisfies } from "@bernouy/cms-integrations";
import { writeCanonicalJsonNoReplace } from "../../../persistence/canonicalFile";
import { integrationVerificationContractLineageId, integrationVerificationContractRevisionId } from "./identity";
import { contractLineageRevisionDocument, parseContractLineageRevision } from "./document";
import {
    ensureContractLineageIdentity,
    MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES,
    readContractLineageHistory,
    sameCanonical,
} from "./history";
import { contractLineageRevisionFilename, ensureContractLineagePaths, MAX_CONTRACT_LINEAGE_REVISIONS } from "./layout";
import { resolveActiveVerificationContracts } from "./resolver";
import type {
    FsIntegrationVerificationContractCatalogConfig,
    IntegrationVerificationContractLineageRevision,
    IntegrationVerificationContractLineageStore,
    RegisterIntegrationVerificationContractsRequest,
} from "./types";

export class FsIntegrationVerificationContractCatalog implements IntegrationVerificationContractLineageStore {
    constructor(private readonly config: FsIntegrationVerificationContractCatalogConfig) {}

    async listActive(kind: string, targetVersion: string) {
        return await resolveActiveVerificationContracts(this.config, kind, targetVersion);
    }

    async register(
        request: RegisterIntegrationVerificationContractsRequest,
    ): Promise<readonly IntegrationVerificationContractLineageRevision[]> {
        return await this.config.mutations.runExclusive(request.kind, async () => {
            await this.#assertRegistrationIdentity(request);
            const revisions = [];
            for (const contract of request.verification.manifest.contracts) {
                revisions.push(await this.#registerContract(request, contract));
            }
            return Object.freeze(revisions);
        });
    }

    async #assertRegistrationIdentity(request: RegisterIntegrationVerificationContractsRequest): Promise<void> {
        const snapshot = this.config.snapshots.current();
        const location = snapshot.locateExactVersion(request.kind, request.version);
        const entry = snapshot
            .getIndex(request.kind)
            ?.versions.find((candidate) => candidate.version === request.version);
        const ownReferences = request.activeContracts.filter((contract) => contract.ownerVersion === request.version);
        if (
            !location ||
            !entry ||
            location.package.digest !== request.packageDigest ||
            entry.verificationDigest !== request.verificationDigest ||
            request.verification.target.kind !== request.kind ||
            request.verification.target.version !== request.version ||
            request.verification.target.packageDigest !== request.packageDigest ||
            (await computeIntegrationVerificationDigest(request.verification)) !== request.verificationDigest ||
            ownReferences.length !== request.verification.manifest.contracts.length
        ) {
            throw new Error("Candidate contract lineage registration identity is stale or incomplete");
        }
    }

    async #registerContract(
        request: RegisterIntegrationVerificationContractsRequest,
        contract: RegisterIntegrationVerificationContractsRequest["verification"]["manifest"]["contracts"][number],
    ): Promise<IntegrationVerificationContractLineageRevision> {
        const reference = request.activeContracts.find(
            (entry) => entry.contractId === contract.contractId && entry.ownerVersion === request.version,
        );
        const contractDigest = await computeIntegrationVerificationSuiteContentDigest(
            request.verification,
            "contract",
            contract.contractId,
        );
        const lineageId = await integrationVerificationContractLineageId(request.kind, contract.contractId);
        if (!reference || reference.contractDigest !== contractDigest || reference.lineageId !== lineageId) {
            throw new Error(`Candidate contract ${contract.contractId} does not match its tested admission snapshot`);
        }
        const base = {
            lineageId,
            kind: request.kind,
            contractId: contract.contractId,
            ownerVersion: request.version,
            ownerPackageDigest: request.packageDigest,
            ownerVerificationDigest: request.verificationDigest,
            activeMajorRange: contract.activeMajorRange,
            entrypoint: contract.entrypoint,
            contractDigest,
            createdAt: request.createdAt,
            provenance: request.provenance,
        };
        const revision = parseContractLineageRevision({
            revisionId: await integrationVerificationContractRevisionId(base),
            ...base,
        });
        const key = { kind: request.kind, contractId: contract.contractId };
        const paths = await ensureContractLineagePaths(this.config.root, key);
        await ensureContractLineageIdentity(paths.identity, key);
        const history = await readContractLineageHistory(paths.history);
        const existing = history.revisions.find((entry) => entry.revisionId === revision.revisionId);
        if (existing) {
            if (!sameCanonical(existing, revision)) {
                throw new Error(`Verification contract revision ${revision.revisionId} collided`);
            }
            return existing;
        }
        if (history.revisions.some((entry) => entry.ownerVersion === revision.ownerVersion)) {
            throw new Error(`Verification contract ${contract.contractId} already has another owner at this version`);
        }
        const snapshot = this.config.snapshots.current();
        const committedRevisions = history.revisions.filter((entry) => {
            const version = snapshot
                .getIndex(entry.kind)
                ?.versions.find((candidate) => candidate.version === entry.ownerVersion);
            const location = snapshot.locateExactVersion(entry.kind, entry.ownerVersion);
            if (!version || !location || location.package.digest !== entry.ownerPackageDigest) {
                throw new Error(`Verification contract ${entry.contractId} owner package is absent or substituted`);
            }
            return version.status !== "unverified";
        });
        if (
            committedRevisions.some(
                (entry) =>
                    integrationVersionSatisfies(revision.ownerVersion, entry.activeMajorRange) ||
                    integrationVersionSatisfies(entry.ownerVersion, revision.activeMajorRange),
            )
        ) {
            throw new Error(`Verification contract ${contract.contractId} cannot be superseded within one major`);
        }
        if (history.revisions.length >= MAX_CONTRACT_LINEAGE_REVISIONS) {
            throw new Error(`Verification contract ${contract.contractId} reached its revision limit`);
        }
        const path = join(paths.revisions, contractLineageRevisionFilename(history.revisions.length + 1));
        await writeCanonicalJsonNoReplace(
            path,
            contractLineageRevisionDocument(revision),
            MAX_CONTRACT_LINEAGE_DOCUMENT_BYTES,
        );
        const committed = await readContractLineageHistory(paths.history);
        const stored = committed.revisions.find((entry) => entry.revisionId === revision.revisionId);
        if (!stored || !sameCanonical(stored, revision)) {
            throw new Error(`Verification contract ${contract.contractId} append lost its compare-and-swap`);
        }
        return stored;
    }
}
