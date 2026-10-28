import { previewProviderAuthority } from "cms-repository/providers/selections/core/authority/preview";
import { memoryConnectionDrafts, type ProviderConnectionDraftStore } from "./connectionDrafts";
import { randomUUID } from "node:crypto";
import { ProviderInstallationLifecycle } from "cms-repository/providers/installations/core/lifecycle/ProviderInstallationLifecycle";
import type { ProviderInstallationPreparation } from "cms-repository/providers/installations/interfaces/ProviderInstallationPreparation";
import type { ProviderManagementGateway } from "./types";
import { secretKeyToRef, type SecretStore } from "@bernouy/secret-store";
import {
    type ProviderConnectionDependencies,
    type ProviderConnectionLifecycle,
    type ProviderConnectionPreview,
    type ProviderConnectionPreviewInput,
} from "./connectionTypes";
import { previewResult, requiredSecretKey, validatePreviewInput } from "./connectionSupport";

const PREVIEW_LIFETIME_MS = 5 * 60_000;

/** Keeps provider probes, approval tickets and credential rotation outside the HTTP surface. */
export class ProviderConnectionWorkflow {
    private readonly pending: ProviderConnectionDraftStore;
    private readonly lifecycle: ProviderConnectionLifecycle;
    private readonly reportReader;
    private readonly createId;
    private readonly now;

    constructor(
        private readonly gateway: ProviderManagementGateway,
        private readonly secrets: SecretStore,
        dependencies: ProviderConnectionDependencies,
    ) {
        this.lifecycle =
            dependencies.lifecycle ??
            new ProviderInstallationLifecycle(gateway.installations, gateway.manifests, () => new Date().toISOString());
        this.reportReader = dependencies.readReport;
        this.createId = dependencies.createId ?? randomUUID;
        this.now = dependencies.now ?? Date.now;
        this.pending = dependencies.drafts ?? memoryConnectionDrafts(this.now);
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
        const authority = await previewProviderAuthority(
            manifest,
            await this.gateway.selections.get(this.gateway.siteId),
            this.gateway.releases,
        );
        const ticket = this.createId();
        await this.pending.set(ticket, {
            preparation,
            authorityDigest: authority.authorityDigest,
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
            [...manifest.requires, ...manifest.implementations.flatMap((implementation) => implementation.requires)],
            authority,
        );
    }

    async approve(ticket: string, actorId: string) {
        const pending = await this.pending.get(ticket);
        if (pending && pending.actorId !== actorId) {
            throw Object.assign(new Error("Provider preview belongs to another administrator"), { status: 403 });
        }
        if (!pending || this.now() - pending.createdAt > PREVIEW_LIFETIME_MS) {
            await this.pending.delete(ticket);
            throw new TypeError("Installation preview has expired");
        }
        const reviewedManifest = await this.gateway.manifests.get(
            pending.preparation.candidate.providerId,
            pending.preparation.candidate.manifestVersion,
        );
        if (
            !reviewedManifest ||
            reviewedManifest.yank ||
            reviewedManifest.admission.digest !== pending.preparation.candidate.manifestDigest ||
            (
                await previewProviderAuthority(
                    reviewedManifest.admission.manifest,
                    await this.gateway.selections.get(this.gateway.siteId),
                    this.gateway.releases,
                )
            ).authorityDigest !== pending.authorityDigest
        ) {
            throw Object.assign(new Error("Provider authority changed after preview; review the connection again"), {
                status: 409,
            });
        }
        const tokenKey = requiredSecretKey(pending.preparation.candidate.providerTokenRef);
        const candidate = pending.preparation.candidate;
        let installed = await this.gateway.installations.get({
            siteId: this.gateway.siteId,
            installationId: candidate.id,
        });
        if (installed?.installation.status === "revoked") {
            throw Object.assign(new Error("Provider installation was revoked"), { status: 409 });
        }
        if (
            installed?.installation.providerTokenRef === candidate.providerTokenRef &&
            (installed.installation.approval.manifestDigest !== candidate.manifestDigest ||
                installed.installation.endpoint !== candidate.endpoint)
        ) {
            throw new Error("Provider installation changed after preview");
        }
        let approvalReport = installed?.observation?.report;
        if (!approvalReport || !installed || installed.installation.providerTokenRef !== candidate.providerTokenRef) {
            approvalReport = await this.reportReader(candidate.endpoint, pending.token);
            const pinned = pending.preparation.observation.report;
            if (
                approvalReport.instanceId !== pinned.instanceId ||
                approvalReport.providerId !== pinned.providerId ||
                approvalReport.account.id !== pinned.account.id ||
                approvalReport.manifest.digest !== pinned.manifest.digest
            ) {
                throw new Error("Provider changed after connection preview");
            }
        }
        if (!installed || installed.installation.providerTokenRef !== candidate.providerTokenRef) {
            const preparation =
                pending.preparation.operation === "modify"
                    ? await this.lifecycle.prepareModification(
                          { siteId: this.gateway.siteId, installationId: candidate.id },
                          pending.preparation.expectedRevision!,
                          {
                              endpoint: candidate.endpoint,
                              manifestVersion: candidate.manifestVersion,
                              manifestDigest: candidate.manifestDigest,
                              providerTokenRef: candidate.providerTokenRef,
                          },
                          approvalReport,
                      )
                    : await this.lifecycle.prepare(candidate, approvalReport);
            await this.secrets.set(tokenKey, pending.token);
            installed =
                preparation.operation === "modify"
                    ? await this.lifecycle.modify(preparation, actorId)
                    : await this.lifecycle.approve(preparation, actorId);
        }
        if (installed.installation.status !== "enabled") {
            throw new Error("Provider installation is not enabled");
        }
        if (pending.previousTokenKey && pending.previousTokenKey !== tokenKey) {
            await this.secrets.delete(pending.previousTokenKey).catch(() => undefined);
        }
        let observed = Boolean(installed.observation);
        try {
            if (!observed) {
                await this.lifecycle.observe(
                    { siteId: this.gateway.siteId, installationId: installed.installation.id },
                    installed.revision,
                    approvalReport,
                );
                observed = true;
            }
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
}

export type {
    ProviderConnectionPreview,
    ProviderConnectionPreviewInput,
    ProviderReportReader,
} from "./connectionTypes";
