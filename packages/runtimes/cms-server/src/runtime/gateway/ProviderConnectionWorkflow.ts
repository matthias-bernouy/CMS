import { randomUUID } from "node:crypto";
import {
    ProviderInstallationLifecycle,
    type ProviderInstallationPreparation,
} from "@bernouy/cms-repository/providers/installations";
import { secretKeyToRef, secretRefToKey, type SecretStore } from "@bernouy/secret-store";
import type { ProductionGateway } from "./createProductionGateway";
import { fetchProviderReport } from "./fetchProviderReport";

export type ProviderConnectionPreviewInput = {
    providerId: string;
    version: string;
    endpoint: string;
    token: string;
    installationId?: string;
    revision?: number;
};

export type ProviderConnectionPreview = {
    ticket: string;
    operation: "connect" | "reconnect";
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

type Lifecycle = Pick<
    ProviderInstallationLifecycle,
    "prepare" | "prepareModification" | "approve" | "modify" | "observe"
>;
type Pending = {
    preparation: ProviderInstallationPreparation;
    token: string;
    actorId: string;
    createdAt: number;
    previousTokenKey?: string;
};
type Dependencies = {
    lifecycle?: Lifecycle;
    fetchReport?: typeof fetchProviderReport;
    createId?: () => string;
    now?: () => number;
};

const PREVIEW_LIFETIME_MS = 5 * 60_000;

/** Keeps provider probes, approval tickets and credential rotation outside the HTTP surface. */
export class ProviderConnectionWorkflow {
    private readonly pending = new Map<string, Pending>();
    private readonly lifecycle: Lifecycle;
    private readonly reportReader;
    private readonly createId;
    private readonly now;

    constructor(
        private readonly gateway: ProductionGateway,
        private readonly secrets: SecretStore,
        dependencies: Dependencies = {},
    ) {
        this.lifecycle =
            dependencies.lifecycle ??
            new ProviderInstallationLifecycle(gateway.installations, gateway.manifests, () => new Date().toISOString());
        this.reportReader = dependencies.fetchReport ?? fetchProviderReport;
        this.createId = dependencies.createId ?? randomUUID;
        this.now = dependencies.now ?? Date.now;
    }

    async preview(input: ProviderConnectionPreviewInput, actorId: string): Promise<ProviderConnectionPreview> {
        validatePreviewInput(input);
        const published = await this.gateway.manifests.get(input.providerId, input.version);
        if (!published || published.yank) {
            throw new Error("Provider manifest is not imported or is unavailable");
        }
        const manifest = published.admission.manifest;
        if (!manifest.endpoint.allowedOrigins.includes(input.endpoint)) {
            throw new Error("Endpoint is not allowed by the imported provider manifest");
        }
        const report = await this.reportReader(input.endpoint, input.token);
        const tokenKey = `ULVIA_PROVIDER_${this.createId().replaceAll("-", "").toUpperCase()}`;
        let previousTokenKey: string | undefined;
        let preparation: ProviderInstallationPreparation;
        if (input.installationId) {
            const current = await this.gateway.installations.get({
                siteId: this.gateway.siteId,
                installationId: input.installationId,
            });
            if (!current || current.installation.providerId !== manifest.providerId) {
                throw new Error("Provider installation is not available for reconnection");
            }
            previousTokenKey = requiredSecretKey(current.installation.providerTokenRef);
            preparation = await this.lifecycle.prepareModification(
                { siteId: this.gateway.siteId, installationId: input.installationId },
                input.revision!,
                {
                    endpoint: input.endpoint,
                    manifestVersion: manifest.version,
                    manifestDigest: published.admission.digest,
                    providerTokenRef: secretKeyToRef(tokenKey),
                },
                report,
            );
        } else {
            preparation = await this.lifecycle.prepare(
                {
                    id: this.createId(),
                    siteId: this.gateway.siteId,
                    providerId: manifest.providerId,
                    accountId: report.account.id,
                    endpoint: input.endpoint,
                    manifestVersion: manifest.version,
                    manifestDigest: published.admission.digest,
                    providerTokenRef: secretKeyToRef(tokenKey),
                    configuration: {},
                },
                report,
            );
        }
        this.clearExpired();
        const ticket = this.createId();
        this.pending.set(ticket, {
            preparation,
            token: input.token,
            actorId,
            createdAt: this.now(),
            previousTokenKey,
        });
        return previewResult(
            ticket,
            preparation.operation,
            manifest.name,
            input.endpoint,
            published.admission.digest,
            report,
        );
    }

    async approve(ticket: string, actorId: string) {
        const pending = this.pending.get(ticket);
        if (!pending || pending.actorId !== actorId || this.now() - pending.createdAt > PREVIEW_LIFETIME_MS) {
            this.pending.delete(ticket);
            throw new Error("Installation preview has expired");
        }
        this.pending.delete(ticket);
        const tokenKey = requiredSecretKey(pending.preparation.candidate.providerTokenRef);
        await this.secrets.set(tokenKey, pending.token);
        let installed;
        try {
            installed =
                pending.preparation.operation === "modify"
                    ? await this.lifecycle.modify(pending.preparation, actorId)
                    : await this.lifecycle.approve(pending.preparation, actorId);
        } catch (error) {
            await this.secrets.delete(tokenKey);
            throw error;
        }
        if (pending.previousTokenKey && pending.previousTokenKey !== tokenKey) {
            await this.secrets.delete(pending.previousTokenKey).catch(() => undefined);
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
            // The approved connection stays valid and Health exposes the missing observation.
        }
        return {
            installationId: installed.installation.id,
            providerId: installed.installation.providerId,
            operation: pending.preparation.operation === "modify" ? "reconnect" : "connect",
            observed,
        };
    }

    private clearExpired(): void {
        for (const [ticket, pending] of this.pending) {
            if (this.now() - pending.createdAt > PREVIEW_LIFETIME_MS) {
                this.pending.delete(ticket);
            }
        }
    }
}

function validatePreviewInput(input: ProviderConnectionPreviewInput): void {
    if (!input.token || input.token.length > 512 || /[\r\n]/u.test(input.token)) {
        throw new TypeError("Invalid provider token");
    }
    if (Boolean(input.installationId) !== (input.revision !== undefined)) {
        throw new TypeError("Installation ID and revision must be provided together");
    }
}

function requiredSecretKey(reference: string): string {
    const key = secretRefToKey(reference);
    if (!key) {
        throw new Error("Provider credential reference is invalid");
    }
    return key;
}

function previewResult(
    ticket: string,
    operation: ProviderInstallationPreparation["operation"],
    providerName: string,
    endpoint: string,
    manifestDigest: string,
    report: Awaited<ReturnType<typeof fetchProviderReport>>,
): ProviderConnectionPreview {
    return {
        ticket,
        operation: operation === "modify" ? "reconnect" : "connect",
        providerId: report.providerId,
        providerName,
        accountId: report.account.id,
        accountLabel: report.account.label,
        endpoint,
        manifestVersion: report.manifest.version,
        manifestDigest,
        contracts: report.implementations.map(({ contractId, version, status }) => ({ contractId, version, status })),
        check: "Manifest and runtime report validated; live conformance is not yet implemented.",
    };
}
