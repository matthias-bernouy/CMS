import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type {
    StoredProviderInstallation,
    ProviderInstallationStore,
} from "@bernouy/cms-repository/providers/installations";
import type { ProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { satisfiesVersionRange } from "@bernouy/cms-repository/providers";
import type { ProviderAccessStore } from "./interfaces";

type Target = {
    sourceInstallationId: string;
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
            resolveSecret(reference: string): Promise<string | null | undefined>;
        },
    ) {}
    async authenticate(token: string): Promise<string | null> {
        if (!/^[\x21-\x7e]{32,4096}$/u.test(token)) {
            return null;
        }
        const credential = await this.options.store.findCredential(credentialHash(token));
        if (!credential) {
            return null;
        }
        const source = await this.options.installations.get({
            siteId: this.options.siteId,
            installationId: credential.installationId,
        });
        if (
            source?.installation.status !== "enabled" ||
            (source.installation.gatewayTokenRef !== credential.credentialRef &&
                !(
                    credential.pendingUntil &&
                    credential.pendingUntil > Date.now() &&
                    credential.installationDigest === providerInstallationFingerprint(source)
                ))
        ) {
            return null;
        }
        const expected = await this.options.resolveSecret(credential.credentialRef);
        if (!expected) {
            return null;
        }
        const a = Buffer.from(token),
            b = Buffer.from(expected);
        return a.length === b.length && timingSafeEqual(a, b) ? source.installation.id : null;
    }
    async authorize(target: Target, consume = false, bytes = 0): Promise<boolean> {
        if (!Number.isSafeInteger(bytes) || bytes < 0 || bytes > 64 * 1024 * 1024) {
            return false;
        }
        const source = await this.options.installations.get({
            siteId: this.options.siteId,
            installationId: target.sourceInstallationId,
        });
        const destination = await this.options.installations.get({
            siteId: this.options.siteId,
            installationId: target.targetInstallationId,
        });
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
        const manifest = await this.options.manifests.get(
            source.installation.providerId,
            source.installation.approval.manifestVersion,
        );
        const declared =
            manifest &&
            manifest.admission.digest === source.installation.approval.manifestDigest &&
            manifest.admission.manifest.implementations.some((implementation) =>
                implementation.requires.some(
                    (requirement) =>
                        requirement.contractId === target.contractId &&
                        requirement.capabilityId === target.capabilityId &&
                        satisfiesVersionRange(target.version, requirement.versionRange),
                ),
            );
        if (!declared) {
            return false;
        }
        if (!consume) {
            return true;
        }
        const allowed =
            (await this.options.store.consume(target.sourceInstallationId, bytes, {
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
        await this.options.store.registerPendingCredential(credentialHash(token), {
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
        await this.options.store.registerCredential(credentialHash(token), installationId, credentialRef);
    }
}
function credentialHash(token: string) {
    return createHash("sha256").update(`ulvia-provider-gateway-v1\0${token}`).digest("hex");
}

export function providerInstallationFingerprint(source: StoredProviderInstallation): string {
    return createHash("sha256").update(canonicalizeIJson(source.installation)).digest("hex");
}
