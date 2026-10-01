import { importProviderManifest, type ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import type { SecretStore } from "@bernouy/secret-store";
import type { ProductionGateway } from "./createProductionGateway";
import { activateProviderContract } from "./activateProviderContracts";
import { ProviderConnectionWorkflow, type ProviderConnectionPreviewInput } from "./ProviderConnectionWorkflow";

/** Host-owned orchestration: report probing and approval are separate admin actions. */
export class ProviderManagement {
    private readonly connections: ProviderConnectionWorkflow;

    constructor(
        private readonly gateway: ProductionGateway,
        secrets: SecretStore,
        private readonly sources: readonly ProviderRepositorySource[] = [],
    ) {
        this.connections = new ProviderConnectionWorkflow(gateway, secrets);
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
}
