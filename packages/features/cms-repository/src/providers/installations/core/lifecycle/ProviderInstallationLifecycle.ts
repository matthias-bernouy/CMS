import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import { rejectUnknownKeys } from "cms-repository/providers/manifests/core/values";
import type {
    ProviderInstallationChanges,
    ProviderInstallationPreparation,
} from "../../interfaces/ProviderInstallationPreparation";
import type {
    ProviderInstallationClock,
    ProviderInstallationScope,
    ProviderInstallationStore,
    ProviderInstallationWorkflowOptions,
} from "../../interfaces/ProviderInstallationStore";
import { parseInstallationDocument } from "../parsing/documents";
import { parseProviderRuntimeReport } from "../reports/parseProviderRuntimeReport";
import { candidateFromInstallation } from "./candidates";
import { ProviderInstallationWorkflowError } from "./errors";
import { validateProposal, workflowOptions } from "./preparations";
import { assertActive, assertCurrentTimestamp, assertFreshPreparation, assertRevision } from "./state";

/**
 * Pure domain workflow: no HTTP, credential persistence, registration or grants.
 * The host must authorize the caller for every affected site and explicit approval.
 * Issued preparations prevent accidental substitution; they do not authenticate a person.
 */
export class ProviderInstallationLifecycle {
    readonly #issued = new WeakSet<ProviderInstallationPreparation>();
    readonly #options;

    constructor(
        private readonly store: ProviderInstallationStore,
        private readonly catalogue: ProviderManifestCatalogue,
        private readonly clock: ProviderInstallationClock,
        options: ProviderInstallationWorkflowOptions = {},
    ) {
        this.#options = workflowOptions(options);
    }

    async prepare(candidate: unknown, report: unknown): Promise<ProviderInstallationPreparation> {
        const proposal = await validateProposal(
            candidate,
            report,
            this.catalogue,
            this.clock,
            this.#options.limits,
            this.#options.manifestLimits,
        );
        return this.issue({
            kind: "provider-installation-preparation",
            operation: "approve",
            candidate: proposal.candidate,
            observation: { observedAt: proposal.now, report: proposal.report },
            preparedAt: proposal.now,
        });
    }

    async prepareModification(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        changes: ProviderInstallationChanges,
        report: unknown,
    ): Promise<ProviderInstallationPreparation> {
        const reportSnapshot = parseProviderRuntimeReport(report, this.#options.limits);
        const patch = parseInstallationDocument(changes, this.#options.limits, (record) => {
            rejectUnknownKeys(
                record,
                [
                    "endpoint",
                    "manifestVersion",
                    "manifestDigest",
                    "providerTokenRef",
                    "gatewayTokenRef",
                    "configuration",
                ],
                "$",
            );
            return record;
        });
        const current = await this.store.get(scope);
        if (!current) {
            throw new ProviderInstallationWorkflowError(
                "installation_not_found",
                "Installation does not belong to this site",
            );
        }
        assertRevision(current, expectedRevision);
        assertActive(current);
        const candidate = { ...candidateFromInstallation(current.installation), ...patch };
        if (patch.gatewayTokenRef === null) {
            delete candidate.gatewayTokenRef;
        }
        const proposal = await validateProposal(
            candidate,
            reportSnapshot,
            this.catalogue,
            this.clock,
            this.#options.limits,
            this.#options.manifestLimits,
        );
        assertCurrentTimestamp(current, proposal.now);
        return this.issue({
            kind: "provider-installation-preparation",
            operation: "modify",
            candidate: proposal.candidate,
            observation: { observedAt: proposal.now, report: proposal.report },
            preparedAt: proposal.now,
            expectedRevision,
        });
    }

    async approve(preparation: ProviderInstallationPreparation, approvedBy: string) {
        this.assertIssued(preparation, "approve");
        const result = await this.store.approve({
            candidate: preparation.candidate,
            report: preparation.observation.report,
            preparedAt: preparation.preparedAt,
            approvedBy,
        });
        this.#issued.delete(preparation);
        return result;
    }

    async modify(preparation: ProviderInstallationPreparation, approvedBy: string) {
        this.assertIssued(preparation, "modify");
        const result = await this.store.reapprove(
            { installationId: preparation.candidate.id, siteId: preparation.candidate.siteId },
            preparation.expectedRevision!,
            {
                candidate: preparation.candidate,
                report: preparation.observation.report,
                preparedAt: preparation.preparedAt,
                approvedBy,
            },
        );
        this.#issued.delete(preparation);
        return result;
    }

    enable(scope: ProviderInstallationScope, expectedRevision: number) {
        return this.store.setStatus(scope, expectedRevision, "enabled");
    }

    disable(scope: ProviderInstallationScope, expectedRevision: number) {
        return this.store.setStatus(scope, expectedRevision, "disabled");
    }

    revoke(scope: ProviderInstallationScope, expectedRevision: number) {
        return this.store.setStatus(scope, expectedRevision, "revoked");
    }

    observe(scope: ProviderInstallationScope, expectedRevision: number, report: unknown) {
        return this.store.recordObservation(scope, expectedRevision, report);
    }

    private issue(preparation: ProviderInstallationPreparation): ProviderInstallationPreparation {
        const snapshot = deepFreeze(preparation);
        this.#issued.add(snapshot);
        return snapshot;
    }

    private assertIssued(preparation: ProviderInstallationPreparation, operation: "approve" | "modify"): void {
        if (!this.#issued.has(preparation) || preparation.operation !== operation) {
            throw new ProviderInstallationWorkflowError(
                "invalid_preparation",
                "Use a pending proposal issued for this action",
            );
        }
        assertFreshPreparation(preparation.preparedAt, this.clock(), this.#options.maxPreparationAgeMs);
    }
}
