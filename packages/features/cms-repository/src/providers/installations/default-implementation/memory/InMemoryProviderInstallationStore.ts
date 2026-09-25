import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import type { ProviderInstallationStatus } from "../../interfaces/ProviderInstallation";
import type {
    ProviderInstallationApprovalCommand,
    ProviderInstallationClock,
    ProviderInstallationScope,
    ProviderInstallationStore,
    ProviderInstallationWorkflowOptions,
    StoredProviderInstallation,
} from "../../interfaces/ProviderInstallationStore";
import { approvedInstallation, candidateFromInstallation } from "../../core/lifecycle/candidates";
import { ProviderInstallationWorkflowError } from "../../core/lifecycle/errors";
import { validateApprovalCommand, validateProposal, workflowOptions } from "../../core/lifecycle/preparations";
import {
    assertActive,
    assertCurrentTimestamp,
    assertIdentity,
    assertRevision,
    installationScope,
    timestamp,
} from "../../core/lifecycle/state";
import { parseProviderInstallation } from "../../core/parsing/parseProviderInstallation";
import { parseOpaqueId } from "../../core/parsing/fields";

/** Deterministic command adapter. Authorization belongs to the calling CMS host. */
export class InMemoryProviderInstallationStore implements ProviderInstallationStore {
    readonly #records = new Map<string, StoredProviderInstallation>();
    readonly #options;

    constructor(
        private readonly catalogue: ProviderManifestCatalogue,
        private readonly clock: ProviderInstallationClock,
        options: ProviderInstallationWorkflowOptions = {},
    ) {
        this.#options = workflowOptions(options);
    }

    async get(scope: ProviderInstallationScope): Promise<StoredProviderInstallation | null> {
        const record = this.#records.get(parseOpaqueId(scope.installationId, "$.installationId"));
        return record?.installation.siteId === parseOpaqueId(scope.siteId, "$.siteId") ? record : null;
    }

    async list(siteId: string): Promise<readonly StoredProviderInstallation[]> {
        parseOpaqueId(siteId, "$.siteId");
        return Object.freeze(
            [...this.#records.values()]
                .filter((record) => record.installation.siteId === siteId)
                .sort((left, right) =>
                    left.installation.id < right.installation.id
                        ? -1
                        : left.installation.id > right.installation.id
                          ? 1
                          : 0,
                ),
        );
    }

    async approve(command: ProviderInstallationApprovalCommand): Promise<StoredProviderInstallation> {
        const proposal = await validateApprovalCommand(command, this.catalogue, this.clock, this.#options);
        if (this.#records.has(proposal.candidate.id)) {
            throw new ProviderInstallationWorkflowError("installation_exists", "Installation ID is already allocated");
        }
        return this.save({
            installation: approvedInstallation(
                proposal.candidate,
                proposal.approvedBy,
                proposal.now,
                proposal.admission,
                this.#options.limits,
            ),
            revision: 1,
        });
    }

    async reapprove(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        command: ProviderInstallationApprovalCommand,
    ) {
        const reference = installationScope(this.requireCurrent(scope, expectedRevision));
        const proposal = await validateApprovalCommand(command, this.catalogue, this.clock, this.#options);
        const current = this.requireCurrent(reference, expectedRevision);
        assertIdentity(current, proposal.candidate);
        assertCurrentTimestamp(current, proposal.now);
        if (timestamp(proposal.preparedAt) < timestamp(current.installation.updatedAt)) {
            throw new ProviderInstallationWorkflowError(
                "stale_timestamp",
                "Preparation predates the current installation",
            );
        }
        return this.save({
            installation: approvedInstallation(
                proposal.candidate,
                proposal.approvedBy,
                proposal.now,
                proposal.admission,
                this.#options.limits,
                current.installation,
            ),
            revision: current.revision + 1,
        });
    }

    async setStatus(scope: ProviderInstallationScope, expectedRevision: number, status: ProviderInstallationStatus) {
        const current = this.requireCurrent(scope, expectedRevision);
        const now = this.clock();
        assertCurrentTimestamp(current, now);
        const installation = parseProviderInstallation(
            { ...current.installation, status, updatedAt: now },
            this.#options.limits,
        );
        return this.save({ installation, revision: current.revision + 1 });
    }

    async recordObservation(scope: ProviderInstallationScope, expectedRevision: number, report: unknown) {
        const before = this.requireCurrent(scope, expectedRevision);
        const proposal = await validateProposal(
            candidateFromInstallation(before.installation),
            report,
            this.catalogue,
            this.clock,
            this.#options.limits,
            this.#options.manifestLimits,
            true,
        );
        const current = this.requireCurrent(installationScope(before), expectedRevision);
        assertCurrentTimestamp(current, proposal.now);
        if (current.observation && timestamp(proposal.now) < timestamp(current.observation.observedAt)) {
            throw new ProviderInstallationWorkflowError(
                "stale_timestamp",
                "Observation cannot predate the previous observation",
            );
        }
        return this.save({
            installation: current.installation,
            revision: current.revision + 1,
            observation: { observedAt: proposal.now, report: proposal.report },
        });
    }

    private requireCurrent(scope: ProviderInstallationScope, expectedRevision: number): StoredProviderInstallation {
        const record = this.#records.get(parseOpaqueId(scope.installationId, "$.installationId"));
        if (!record || record.installation.siteId !== parseOpaqueId(scope.siteId, "$.siteId")) {
            throw new ProviderInstallationWorkflowError(
                "installation_not_found",
                "Installation does not belong to this site",
            );
        }
        assertRevision(record, expectedRevision);
        assertActive(record);
        return record;
    }

    private save(record: StoredProviderInstallation): StoredProviderInstallation {
        const snapshot = deepFreeze(record);
        this.#records.set(snapshot.installation.id, snapshot);
        return snapshot;
    }
}
