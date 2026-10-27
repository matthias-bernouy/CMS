import { verifyStoredProviderManifestJson } from "cms-repository/providers/manifests/core/admission/admitProviderManifest";
import type { ProviderReleaseRetention } from "cms-repository/providers/installations/interfaces/ProviderInstallationStore";
import { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import { importProviderManifest } from "cms-repository/providers/sources/importProviderManifest";
import type { ProviderRepositorySource } from "cms-repository/providers/sources/interfaces";
import { secretRefToKey, type SecretStore } from "@bernouy/secret-store";
import { activateProviderContract } from "./activateProviderContract";
import {
    ProviderConnectionWorkflow,
    type ProviderConnectionPreviewInput,
    type ProviderReportReader,
} from "./ProviderConnectionWorkflow";
import type { ProviderManagementGateway } from "./types";

export type ProviderManagementOptions = Readonly<{
    drafts?: import("./connectionDrafts").ProviderConnectionDraftStore;
    sources?: readonly ProviderRepositorySource[];
    retention?: ProviderReleaseRetention;
    readReport: ProviderReportReader;
}>;

/** Host-owned orchestration: report probing and approval are separate admin actions. */
export class ProviderManagement {
    private readonly connections: ProviderConnectionWorkflow;
    private readonly lifecycle: ProviderInstallationLifecycle;
    private readonly readReport: ProviderReportReader;

    constructor(
        private readonly gateway: ProviderManagementGateway,
        private readonly secrets: SecretStore,
        options: ProviderManagementOptions,
    ) {
        this.sources = options.sources ?? [];
        this.readReport = options.readReport;
        this.connections = new ProviderConnectionWorkflow(gateway, secrets, {
            readReport: options.readReport,
            drafts: options.drafts,
            lifecycle: new ProviderInstallationLifecycle(
                gateway.installations,
                gateway.manifests,
                () => new Date().toISOString(),
                { retention: options.retention },
            ),
        });
        this.lifecycle = new ProviderInstallationLifecycle(
            gateway.installations,
            gateway.manifests,
            () => new Date().toISOString(),
            { retention: options.retention },
        );
    }

    private readonly sources: readonly ProviderRepositorySource[];

    async importManifest(manifest: string | Uint8Array): Promise<unknown> {
        return importProviderManifest(manifest, this.sources, this.gateway.releases, this.gateway.manifests);
    }

    async catalogue() {
        const entries = (await Promise.all(this.sources.map((source) => source.list("provider-manifest")))).flat();
        if (entries.length > 1024) {
            throw new Error("Provider catalogue is too large");
        }
        return entries;
    }

    async importReference(input: {
        repositoryId: string;
        publisherId: string;
        id: string;
        version: string;
        digest: string;
    }) {
        const source = this.sources.find((item) => item.id === input.repositoryId);
        const listed =
            source &&
            (await source.list("provider-manifest")).find(
                (item) =>
                    item.publisherId === input.publisherId &&
                    item.id === input.id &&
                    item.version === input.version &&
                    item.digest === input.digest,
            );
        if (!source || !listed) {
            throw new TypeError("Provider release is not in the configured catalogue");
        }
        const bytes = await source.get(listed);
        const verified = await verifyStoredProviderManifestJson(bytes, input.digest);
        if (
            verified.manifest.providerId !== input.id ||
            verified.manifest.version !== input.version ||
            verified.manifest.provenance.publisherId !== input.publisherId
        ) {
            throw new TypeError("Provider release coordinate mismatch");
        }
        const result = (await this.importManifest(bytes)) as { digest: string };
        if (result.digest !== input.digest) {
            throw new TypeError("Provider release digest mismatch");
        }
        return result;
    }

    async list() {
        const [installations, selected] = await Promise.all([
            this.gateway.installations.list(this.gateway.siteId),
            this.gateway.selections.get(this.gateway.siteId),
        ]);
        return {
            installations: installations.map(({ installation, revision, observation }) => ({
                id: installation.id,
                providerId: installation.providerId,
                accountId: installation.accountId,
                endpoint: installation.endpoint,
                status: installation.status,
                manifestVersion: installation.approval.manifestVersion,
                manifestDigest: installation.approval.manifestDigest,
                revision,
                observedAt: observation?.observedAt ?? null,
                contracts:
                    observation?.report.implementations.map(({ contractId, version, digest, status }) => ({
                        contractId,
                        version,
                        digest,
                        status,
                    })) ?? [],
            })),
            selected: selected?.plan.selections ?? [],
        };
    }

    preview(input: ProviderConnectionPreviewInput, actorId: string) {
        return this.connections.preview(input, actorId);
    }

    async approve(ticket: string, actorId: string) {
        return this.connections.approve(ticket, actorId);
    }

    async refreshObservation(installationId: string) {
        const scope = { siteId: this.gateway.siteId, installationId };
        const current = await this.gateway.installations.get(scope);
        if (!current) {
            throw Object.assign(new Error("Provider installation is unavailable"), { status: 404 });
        }
        const token = await this.secrets.get(requiredSecretKey(current.installation.providerTokenRef));
        if (!token) {
            throw new Error("Provider credential is unavailable");
        }
        const report = await this.readReport(current.installation.endpoint, token);
        return this.lifecycle.observe(scope, current.revision, report);
    }

    async selectContract(input: { installationId: string; contractId: string; version: string; digest: string }) {
        return activateProviderContract(this.gateway, input);
    }

    async replaceSelections(input: {
        expectedRevision: number;
        selections: readonly {
            installationId: string;
            contractId: string;
            version: string;
            digest: string;
        }[];
    }) {
        const stored = await this.gateway.selections.replace(
            this.gateway.siteId,
            input.selections.map((selection) => ({ ...selection, siteId: this.gateway.siteId })),
            input.expectedRevision,
        );
        return { revision: stored.revision, selected: stored.plan.selections };
    }

    async setStatus(input: { installationId: string; revision: number; action: "enable" | "disable" | "revoke" }) {
        const scope = { siteId: this.gateway.siteId, installationId: input.installationId };
        const [current, selections] = await Promise.all([
            this.gateway.installations.get(scope),
            input.action === "enable" ? Promise.resolve(null) : this.gateway.selections.get(this.gateway.siteId),
        ]);
        if (!current) {
            throw Object.assign(new Error("Provider installation is unavailable"), { status: 404 });
        }
        if (selections?.plan.selections.some(({ installationId }) => installationId === input.installationId)) {
            throw Object.assign(new Error("Provider installation is selected by one or more contracts"), {
                code: "installation_selected",
                status: 409,
            });
        }
        const credentialKeys =
            input.action === "revoke"
                ? [current.installation.providerTokenRef, current.installation.gatewayTokenRef]
                      .filter((reference): reference is string => Boolean(reference))
                      .map(requiredSecretKey)
                : [];
        const stored =
            input.action === "revoke" && current.installation.status === "revoked"
                ? requireRevision(current, input.revision)
                : await this.lifecycle[input.action](scope, input.revision);
        const deletions = await Promise.allSettled(credentialKeys.map((key) => this.secrets.delete(key)));
        return {
            installationId: stored.installation.id,
            status: stored.installation.status,
            revision: stored.revision,
            credentialsDeleted: deletions.every((result) => result.status === "fulfilled"),
        };
    }
}

function requireRevision<T extends { revision: number }>(record: T, expected: number): T {
    if (record.revision !== expected) {
        throw Object.assign(new Error("Provider installation revision conflict"), {
            code: "revision_conflict",
            status: 409,
        });
    }
    return record;
}

function requiredSecretKey(reference: string): string {
    const key = secretRefToKey(reference);
    if (!key) {
        throw new Error("Provider credential reference is invalid");
    }
    return key;
}
