import { randomUUID } from "node:crypto";
import { ProviderInstallationLifecycle } from "@bernouy/cms-repository/providers/installations";
import { importProviderManifest, type ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import type { SecretStore } from "@bernouy/secret-store";
import type { ProductionGateway } from "./createProductionGateway";
import { activateProviderContract } from "./activateProviderContracts";
import { fetchProviderReport } from "./fetchProviderReport";

type Preparation = Awaited<ReturnType<ProviderInstallationLifecycle["prepare"]>>;
type Pending = { preparation: Preparation; token: string; actorId: string; createdAt: number };
type PreviewResult = {
    ticket: string;
    providerId: string;
    providerName: string;
    accountId: string;
    accountLabel: string;
    endpoint: string;
    manifestVersion: string;
    manifestDigest: string;
    contracts: { contractId: string; version: string; status: string }[];
    check: string;
};

/** Host-owned orchestration: report probing and approval are separate admin actions. */
export class ProviderManagement {
    private readonly pending = new Map<string, Pending>();
    private readonly lifecycle: ProviderInstallationLifecycle;

    constructor(
        private readonly gateway: ProductionGateway,
        private readonly secrets: SecretStore,
        private readonly sources: readonly ProviderRepositorySource[] = [],
    ) {
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

    async preview(
        input: { providerId: string; version: string; endpoint: string; token: string },
        actorId: string,
    ): Promise<PreviewResult> {
        if (!input.token || input.token.length > 512 || /[\r\n]/u.test(input.token)) {
            throw new TypeError("Invalid provider token");
        }
        const published = await this.gateway.manifests.get(input.providerId, input.version);
        if (!published || published.yank) {
            throw new Error("Provider manifest is not imported or is unavailable");
        }
        const manifest = published.admission.manifest;
        if (!manifest.endpoint.allowedOrigins.includes(input.endpoint)) {
            throw new Error("Endpoint is not allowed by the imported provider manifest");
        }
        const report = await fetchProviderReport(input.endpoint, input.token);
        const key = `ULVIA_PROVIDER_${randomUUID().replaceAll("-", "").toUpperCase()}`;
        const preparation = await this.lifecycle.prepare(
            {
                id: randomUUID(),
                siteId: this.gateway.siteId,
                providerId: manifest.providerId,
                accountId: report.account.id,
                endpoint: input.endpoint,
                manifestVersion: manifest.version,
                manifestDigest: published.admission.digest,
                providerTokenRef: `\${${key}}`,
                configuration: {},
            },
            report,
        );
        this.clearExpired();
        const ticket = randomUUID();
        this.pending.set(ticket, {
            preparation,
            token: input.token,
            actorId,
            createdAt: Date.now(),
        });
        return {
            ticket,
            providerId: manifest.providerId,
            providerName: manifest.name,
            accountId: report.account.id,
            accountLabel: report.account.label,
            endpoint: input.endpoint,
            manifestVersion: manifest.version,
            manifestDigest: published.admission.digest,
            contracts: report.implementations.map(({ contractId, version, status }) => ({
                contractId,
                version,
                status,
            })),
            check: "Manifest and runtime report validated; live conformance is not yet implemented.",
        };
    }

    async approve(ticket: string, actorId: string) {
        const pending = this.pending.get(ticket);
        if (!pending || pending.actorId !== actorId || Date.now() - pending.createdAt > 5 * 60_000) {
            this.pending.delete(ticket);
            throw new Error("Installation preview has expired");
        }
        this.pending.delete(ticket);
        const reference = pending.preparation.candidate.providerTokenRef;
        const key = reference.slice(2, -1);
        await this.secrets.set(key, pending.token);
        let installed: Awaited<ReturnType<ProviderInstallationLifecycle["approve"]>>;
        try {
            installed = await this.lifecycle.approve(pending.preparation, actorId);
        } catch (error) {
            await this.secrets.delete(key);
            throw error;
        }
        let observed = false;
        try {
            await this.lifecycle.observe(
                { siteId: this.gateway.siteId, installationId: installed.installation.id },
                installed.revision,
                pending.preparation.observation.report,
            );
            observed = true;
        } catch {
            // Approval remains valid. An operator can refresh readiness later.
        }
        return { installationId: installed.installation.id, providerId: installed.installation.providerId, observed };
    }

    async selectContract(input: { installationId: string; contractId: string; version: string; digest: string }) {
        return activateProviderContract(this.gateway, input);
    }

    private clearExpired(): void {
        for (const [ticket, pending] of this.pending) {
            if (Date.now() - pending.createdAt > 5 * 60_000) {
                this.pending.delete(ticket);
            }
        }
    }
}
