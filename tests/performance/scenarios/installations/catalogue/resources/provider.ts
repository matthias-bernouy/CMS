import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { assertCondition } from "../../../queries/types";
import type { CatalogueContract } from "./contract";

/** Controlled report observations describe only the owned metadata fixture; no external business executor is invoked. */
export async function catalogueProvider(
    namespace: string,
    index: number,
    patch: number,
    contracts: readonly CatalogueContract[],
    catalogue: Parameters<typeof admitProviderManifestJson>[1],
) {
    assertCondition(
        Number.isSafeInteger(index) && index >= 0 && index < 64 && patch >= 0 && patch < 128 && contracts.length <= 64,
        "metadata-catalogue-provider-bound",
    );
    const manifest = {
        kind: "provider-manifest",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        providerId: `${namespace}/controlled-provider-${index}`,
        name: `Controlled Provider ${index} revision ${patch}`,
        version: `1.0.${patch}`,
        provenance: { publisherId: namespace, publishedAt: "2026-11-17T00:00:00.000Z" },
        buildVersionRange: "^1.0.0",
        endpoint: { allowedOrigins: ["http://ulvia-provider:5103"] },
        configuration: { type: "object", properties: {}, required: [] },
        credentialSlots: [],
        requires: [],
        implementations: contracts.map((resource) => ({
            contractId: resource.id,
            version: resource.version,
            digest: resource.digest,
            requires: [],
        })),
    };
    const admission = await admitProviderManifestJson(JSON.stringify(manifest), catalogue);
    return {
        kind: "provider-manifest" as const,
        id: manifest.providerId,
        namespace,
        version: manifest.version,
        digest: admission.digest,
        name: manifest.name,
        canonicalJson: admission.canonicalJson,
        assets: [],
        admission,
        manifest: encodePublicationUpload({
            kind: "provider-manifest",
            canonicalJson: admission.canonicalJson,
            assets: [],
        }),
        index,
        patch,
    };
}

export type CatalogueProvider = Awaited<ReturnType<typeof catalogueProvider>>;
