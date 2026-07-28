import type {
    IntegrationPackageEnvelopeV1,
    IntegrationPackageLimits,
    ResolvedIntegrationPackage,
} from "@bernouy/cms-integration-packages";
import {
    canonicalJsonBytes,
    resolveIntegrationPackageLimits,
    sha256Hex,
    validateIntegrationPackageEnvelope,
} from "@bernouy/cms-integration-packages";

export const INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA = "cms.integration.registry.version-manifest.v1" as const;

export type IntegrationRegistryVersionManifestV1 = Readonly<{
    schema: typeof INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA;
    digest: string;
    envelope: IntegrationPackageEnvelopeV1;
}>;

export type PreparedIntegrationRegistryVersionManifest = Readonly<{
    document: IntegrationRegistryVersionManifestV1;
    documentBytes: Uint8Array;
    package: ResolvedIntegrationPackage;
}>;

export async function prepareIntegrationRegistryVersionManifest(
    input: ResolvedIntegrationPackage,
    limitOverrides?: Partial<IntegrationPackageLimits>,
): Promise<PreparedIntegrationRegistryVersionManifest> {
    const limits = resolveIntegrationPackageLimits(limitOverrides);
    const envelope = validateIntegrationPackageEnvelope(input.envelope, {
        limits,
        requireReleaseNotes: true,
    });
    const canonicalBytes = canonicalJsonBytes(envelope);
    if (!equalBytes(canonicalBytes, input.canonicalBytes)) {
        throw new Error("Integration registry version manifest package bytes are not canonical");
    }
    const digest = await sha256Hex(canonicalBytes);
    if (digest !== input.digest) {
        throw new Error("Integration registry version manifest digest does not match its envelope");
    }
    const document: IntegrationRegistryVersionManifestV1 = {
        schema: INTEGRATION_REGISTRY_VERSION_MANIFEST_SCHEMA,
        digest,
        envelope,
    };
    const documentBytes = canonicalJsonBytes(document);
    if (documentBytes.byteLength > manifestDocumentByteLimit(limits)) {
        throw new Error("Integration registry version manifest exceeds its bounded document size");
    }
    return { document, documentBytes, package: { envelope, canonicalBytes, digest } };
}

export function manifestDocumentByteLimit(limits: Readonly<IntegrationPackageLimits>): number {
    const overhead = 1_024;
    if (limits.maxDocumentBytes > Number.MAX_SAFE_INTEGER - overhead) {
        throw new TypeError("Integration package document limit leaves no safe manifest overhead");
    }
    return limits.maxDocumentBytes + overhead;
}

export function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
