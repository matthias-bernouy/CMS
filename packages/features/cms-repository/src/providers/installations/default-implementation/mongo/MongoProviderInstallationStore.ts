import type { Db } from "mongodb";
import { MongoServerError } from "mongodb";
import type { ProviderManifestCatalogue } from "cms-repository/providers/manifests/interfaces/ProviderManifestCatalogue";
import { catalogueRevision } from "cms-repository/exports/contracts/protocol";
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
import { installationSelectionRevision } from "../../core/selectionRevision";
import type { ProviderInstallationStatus } from "../../interfaces/ProviderInstallation";
import type {
    ProviderInstallationApprovalCommand,
    ProviderInstallationClock,
    ProviderInstallationScope,
    ProviderInstallationStore,
    ProviderInstallationWorkflowOptions,
    StoredProviderInstallation,
} from "../../interfaces/ProviderInstallationStore";
import { installationDocument, type InstallationDocument, readInstallationDocument } from "./record";

/** Durable site-scoped installation state. Mongo's revision predicate fences concurrent writers. */
export class MongoProviderInstallationStore implements ProviderInstallationStore {
    readonly #collection;
    readonly #options;

    constructor(
        db: Db,
        private readonly catalogue: ProviderManifestCatalogue,
        private readonly clock: ProviderInstallationClock,
        options: ProviderInstallationWorkflowOptions = {},
    ) {
        this.#collection = db.collection<InstallationDocument>("cms_provider_installations");
        this.#options = workflowOptions(options);
    }

    async init(): Promise<void> {
        await this.#collection.createIndex({ siteId: 1, _id: 1 });
    }

    async revision(siteId: string): Promise<string> {
        const site = parseOpaqueId(siteId, "$.siteId");
        const records = await this.#collection
            .find({ siteId: site }, { projection: { _id: 1, revision: 1 } })
            .sort({ _id: 1 })
            .toArray();
        return catalogueRevision({ siteId: site, records: records.map((record) => [record._id, record.revision]) });
    }

    async selectionRevision(siteId: string): Promise<string> {
        const site = parseOpaqueId(siteId, "$.siteId");
        const records = await this.#collection
            .find({ siteId: site }, { projection: { installation: 1 } })
            .sort({ _id: 1 })
            .toArray();
        return installationSelectionRevision(
            site,
            records.map((record) => record.installation),
        );
    }

    async get(scope: ProviderInstallationScope): Promise<StoredProviderInstallation | null> {
        const document = await this.#collection.findOne({
            _id: parseOpaqueId(scope.installationId, "$.installationId"),
            siteId: parseOpaqueId(scope.siteId, "$.siteId"),
        });
        return document ? readInstallationDocument(document, this.#options.limits) : null;
    }

    async list(siteId: string): Promise<readonly StoredProviderInstallation[]> {
        const documents = await this.#collection
            .find({ siteId: parseOpaqueId(siteId, "$.siteId") })
            .sort({ _id: 1 })
            .toArray();
        return Object.freeze(documents.map((document) => readInstallationDocument(document, this.#options.limits)));
    }

    async approve(command: ProviderInstallationApprovalCommand): Promise<StoredProviderInstallation> {
        const proposal = await validateApprovalCommand(command, this.catalogue, this.clock, this.#options);
        const record = {
            installation: approvedInstallation(
                proposal.candidate,
                proposal.approvedBy,
                proposal.now,
                proposal.admission,
                this.#options.limits,
            ),
            revision: 1,
        };
        try {
            await this.#collection.insertOne(installationDocument(record));
        } catch (error) {
            if (error instanceof MongoServerError && error.code === 11000) {
                throw new ProviderInstallationWorkflowError(
                    "installation_exists",
                    "Installation ID is already allocated",
                );
            }
            throw error;
        }
        return readInstallationDocument(installationDocument(record), this.#options.limits);
    }

    async reapprove(
        scope: ProviderInstallationScope,
        expectedRevision: number,
        command: ProviderInstallationApprovalCommand,
    ): Promise<StoredProviderInstallation> {
        const before = await this.requireCurrent(scope, expectedRevision);
        const proposal = await validateApprovalCommand(command, this.catalogue, this.clock, this.#options);
        assertIdentity(before, proposal.candidate);
        assertCurrentTimestamp(before, proposal.now);
        if (timestamp(proposal.preparedAt) < timestamp(before.installation.updatedAt)) {
            throw new ProviderInstallationWorkflowError(
                "stale_timestamp",
                "Preparation predates the current installation",
            );
        }
        return this.replace(before, {
            installation: approvedInstallation(
                proposal.candidate,
                proposal.approvedBy,
                proposal.now,
                proposal.admission,
                this.#options.limits,
                before.installation,
            ),
            revision: expectedRevision + 1,
        });
    }

    async setStatus(scope: ProviderInstallationScope, expectedRevision: number, status: ProviderInstallationStatus) {
        const before = await this.requireCurrent(scope, expectedRevision);
        const now = this.clock();
        assertCurrentTimestamp(before, now);
        return this.replace(before, {
            installation: parseProviderInstallation(
                { ...before.installation, status, updatedAt: now },
                this.#options.limits,
            ),
            revision: expectedRevision + 1,
        });
    }

    async recordObservation(scope: ProviderInstallationScope, expectedRevision: number, report: unknown) {
        const before = await this.requireCurrent(scope, expectedRevision);
        const proposal = await validateProposal(
            candidateFromInstallation(before.installation),
            report,
            this.catalogue,
            this.clock,
            this.#options.limits,
            this.#options.manifestLimits,
            true,
        );
        assertCurrentTimestamp(before, proposal.now);
        if (before.observation && timestamp(proposal.now) < timestamp(before.observation.observedAt)) {
            throw new ProviderInstallationWorkflowError(
                "stale_timestamp",
                "Observation cannot predate the previous observation",
            );
        }
        return this.replace(before, {
            installation: before.installation,
            revision: expectedRevision + 1,
            observation: { observedAt: proposal.now, report: proposal.report },
        });
    }

    private async requireCurrent(scope: ProviderInstallationScope, expectedRevision: number) {
        const record = await this.get(scope);
        if (!record) {
            throw new ProviderInstallationWorkflowError(
                "installation_not_found",
                "Installation does not belong to this site",
            );
        }
        assertRevision(record, expectedRevision);
        assertActive(record);
        return record;
    }

    private async replace(before: StoredProviderInstallation, after: StoredProviderInstallation) {
        const scope = installationScope(before);
        const result = await this.#collection.replaceOne(
            {
                _id: scope.installationId,
                siteId: scope.siteId,
                revision: before.revision,
                "installation.status": { $ne: "revoked" },
            },
            installationDocument(after),
        );
        if (result.matchedCount !== 1) {
            throw new ProviderInstallationWorkflowError("revision_conflict", "Installation revision changed");
        }
        return readInstallationDocument(installationDocument(after), this.#options.limits);
    }
}
