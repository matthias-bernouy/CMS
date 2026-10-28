import { GatewayAuthorityReads } from "cms-gateway/invocation/core/dispatch/GatewayAuthorityReads";
import { activeProviderRequirements } from "@bernouy/cms-repository/providers/selections";
import {
    currentProviderCredential,
    providerCredentialFingerprint,
    providerInstallationFingerprint,
} from "./credentials";
import type { ProviderInstallationStore } from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import type { GatewayRouteResolver } from "cms-gateway/invocation/interfaces/Invocation";
import { capabilityGranted, type ContractSelectionStore } from "@bernouy/cms-repository/providers/selections";
import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderAccessStore } from "./interfaces";

type Target = {
    sourceInstallationId: string;
    sourceCredentialFingerprint?: string;
    targetInstallationId: string;
    contractId: string;
    capabilityId: string;
    version: string;
};

/** Approved manifest requirements define machine authority; no user roles are inferred. */
export class ProviderAccess {
    constructor(
        private readonly options: {
            siteId: string;
            installations: ProviderInstallationStore;
            manifests: ProviderManifestCatalogue;
            store: ProviderAccessStore;
            selections: Pick<ContractSelectionStore, "get">;
            routes: GatewayRouteResolver;
            resolveSecret(reference: string): Promise<string | null | undefined>;
        },
    ) {}
    async authenticate(token: string): Promise<string | null> {
        if (!/^[\x21-\x7e]{32,4096}$/u.test(token)) {
            return null;
        }
        return (
            (await currentProviderCredential(this.options, providerCredentialFingerprint(token)))?.installation.id ??
            null
        );
    }

    async authorize(
        target: Target,
        consume = false,
        bytes = 0,
        reads = new GatewayAuthorityReads(this.options.siteId),
    ): Promise<boolean> {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 64 * 1024 * 1024) {
            return false;
        }
        const source = await reads.installation(
            this.options.installations,
            this.options.siteId,
            target.sourceInstallationId,
        );
        const destination = await reads.installation(
            this.options.installations,
            this.options.siteId,
            target.targetInstallationId,
        );
        if (source?.installation.status !== "enabled" || destination?.installation.status !== "enabled") {
            return false;
        }
        if (
            !source.installation.gatewayTokenRef &&
            !(await this.options.store.hasPendingCredential(
                source.installation.id,
                providerInstallationFingerprint(source),
                Date.now(),
            ))
        ) {
            return false;
        }
        if (
            (consume || target.sourceCredentialFingerprint !== undefined) &&
            !(await currentProviderCredential(this.options, target.sourceCredentialFingerprint, source))
        ) {
            return false;
        }
        const manifest = await this.options.manifests.get(
            source.installation.providerId,
            source.installation.approval.manifestVersion,
        );
        const current = await reads.selection(this.options.selections, this.options.siteId);
        const route = await this.options.routes.resolve(this.options.siteId, target.contractId, reads);
        if (
            !current ||
            !route ||
            route.selection.installationId !== target.targetInstallationId ||
            route.requestedRelease.admission.release.version !== target.version ||
            !route.requestedRelease.admission.release.capabilities.some(({ id }) => id === target.capabilityId) ||
            !capabilityGranted(current.grants, route.selection.contractId, target.capabilityId) ||
            !(await this.options.routes.isCurrent(route))
        ) {
            return false;
        }
        const approved = manifest?.admission.manifest;
        const requirements = approved
            ? activeProviderRequirements(approved, current.plan.selections, target.sourceInstallationId)
            : [];
        const declared =
            manifest &&
            manifest.admission.digest === source.installation.approval.manifestDigest &&
            requirements.some(
                (requirement) =>
                    requirement.contractId === target.contractId &&
                    requirement.capabilityId === target.capabilityId &&
                    satisfiesVersionRange(target.version, requirement.versionRange),
            );
        if (!declared) {
            return false;
        }
        if (!consume) {
            return true;
        }
        return this.consumeBudget(target.sourceInstallationId, bytes);
    }
    async consumeBudget(sourceInstallationId: string, bytes: number) {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 64 * 1024 * 1024) {
            return false;
        }
        const allowed =
            (await this.options.store.consume(sourceInstallationId, bytes, {
                calls: 120,
                bytes: 8 * 1024 * 1024,
            })) && (await this.options.store.consume("*", bytes, { calls: 1000, bytes: 16 * 1024 * 1024 }));
        if (!allowed) {
            throw Object.assign(new Error("Provider rate limit exceeded"), {
                code: "provider_rate_limited",
                status: 429,
            });
        }
        return true;
    }
    async beginCredential(installationId: string, credentialRef: string, token: string, installationDigest: string) {
        const source = await this.options.installations.get({ siteId: this.options.siteId, installationId });
        if (
            source?.installation.status !== "enabled" ||
            providerInstallationFingerprint(source) !== installationDigest
        ) {
            throw new Error("Provider changed before pairing");
        }
        await this.options.store.registerPendingCredential(providerCredentialFingerprint(token), {
            installationId,
            credentialRef,
            installationDigest,
            pendingUntil: Date.now() + 300_000,
        });
    }
    async registerCredential(installationId: string, credentialRef: string, token: string) {
        const source = await this.options.installations.get({ siteId: this.options.siteId, installationId });
        if (source?.installation.gatewayTokenRef !== credentialRef) {
            throw new Error("Provider credential changed");
        }
        await this.options.store.registerCredential(
            providerCredentialFingerprint(token),
            installationId,
            credentialRef,
        );
    }
}
