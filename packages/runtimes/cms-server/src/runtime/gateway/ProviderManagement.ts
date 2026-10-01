import { importProviderManifest, type ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import { ProviderInstallationLifecycle } from "@bernouy/cms-repository/providers/installations";
import { secretRefToKey, type SecretStore } from "@bernouy/secret-store";
import type { ProductionGateway } from "./createProductionGateway";
import { activateProviderContract } from "./activateProviderContracts";
import { ProviderConnectionWorkflow, type ProviderConnectionPreviewInput } from "./ProviderConnectionWorkflow";

/** Host-owned orchestration: report probing and approval are separate admin actions. */
export class ProviderManagement {
    private readonly connections: ProviderConnectionWorkflow;
    private readonly lifecycle: ProviderInstallationLifecycle;

    constructor(
        private readonly gateway: ProductionGateway,
        private readonly secrets: SecretStore,
        private readonly sources: readonly ProviderRepositorySource[] = [],
    ) {
        this.connections = new ProviderConnectionWorkflow(gateway, secrets);
        this.lifecycle = new ProviderInstallationLifecycle(gateway.installations, gateway.manifests, () =>
            new Date().toISOString(),
        );
    }

    async importManifest(manifest: string): Promise<unknown> {
        return importProviderManifest(manifest, this.sources, this.gateway.releases, this.gateway.manifests);
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

    async selectContract(input: { installationId: string; contractId: string; version: string; digest: string }) {
        return activateProviderContract(this.gateway, input);
    }

    async setStatus(input: { installationId: string; revision: number; action: "enable" | "disable" | "revoke" }) {
        const scope = { siteId: this.gateway.siteId, installationId: input.installationId };
        const current = await this.gateway.installations.get(scope);
        if (!current) {
            throw new Error("Provider installation is unavailable");
        }
        const credentialKeys =
            input.action === "revoke"
                ? [current.installation.providerTokenRef, current.installation.gatewayTokenRef]
                      .filter((reference): reference is string => Boolean(reference))
                      .map(requiredSecretKey)
                : [];
        const stored = await this.lifecycle[input.action](scope, input.revision);
        const deletions = await Promise.allSettled(credentialKeys.map((key) => this.secrets.delete(key)));
        return {
            installationId: stored.installation.id,
            status: stored.installation.status,
            revision: stored.revision,
            credentialsDeleted: deletions.every((result) => result.status === "fulfilled"),
        };
    }
}

function requiredSecretKey(reference: string): string {
    const key = secretRefToKey(reference);
    if (!key) {
        throw new Error("Provider credential reference is invalid");
    }
    return key;
}
