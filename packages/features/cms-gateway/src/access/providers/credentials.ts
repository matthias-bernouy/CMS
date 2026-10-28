import { createHash, timingSafeEqual } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";
import type {
    StoredProviderInstallation,
    ProviderInstallationStore,
} from "@bernouy/cms-repository/providers/installations";
import type { ProviderAccessStore } from "./interfaces";

export async function currentProviderCredential(
    options: {
        siteId: string;
        installations: ProviderInstallationStore;
        store: ProviderAccessStore;
        resolveSecret(reference: string): Promise<string | null | undefined>;
    },
    fingerprint: string | undefined,
    snapshot?: StoredProviderInstallation,
): Promise<StoredProviderInstallation | null> {
    if (!fingerprint || !/^[a-f0-9]{64}$/.test(fingerprint)) {
        return null;
    }
    const record = await options.store.findCredential(fingerprint);
    if (!record) {
        return null;
    }
    const source =
        snapshot ??
        (await options.installations.get({ siteId: options.siteId, installationId: record.installationId }));
    if (
        !source ||
        source.installation.status !== "enabled" ||
        source.installation.siteId !== options.siteId ||
        source.installation.id !== record.installationId ||
        (record.credentialRef !== source.installation.gatewayTokenRef &&
            !(
                record.pendingUntil &&
                record.pendingUntil > Date.now() &&
                record.installationDigest === providerInstallationFingerprint(source)
            ))
    ) {
        return null;
    }
    const secret = await options.resolveSecret(record.credentialRef);
    if (
        !secret ||
        !timingSafeEqual(Buffer.from(providerCredentialFingerprint(secret), "hex"), Buffer.from(fingerprint, "hex"))
    ) {
        return null;
    }
    return source;
}
export function providerCredentialFingerprint(token: string) {
    return createHash("sha256").update(`ulvia-provider-gateway-v1\0${token}`).digest("hex");
}
export function providerInstallationFingerprint(source: StoredProviderInstallation): string {
    return createHash("sha256").update(canonicalizeIJson(source.installation)).digest("hex");
}
