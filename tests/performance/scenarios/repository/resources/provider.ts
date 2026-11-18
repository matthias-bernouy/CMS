import { admitProviderManifestJson } from "@bernouy/ulvia-providers";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { authoredFixture } from "../../../fixtures/authored";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

/** A discovery fixture admits a real manifest; its inert endpoint is never invoked as a business provider. */
export async function publicationProvider(
    namespace: string,
    implementation: ContractParentReference,
    catalogue: Parameters<typeof admitProviderManifestJson>[1],
    options: Readonly<{ suffix: string; version: string; name: string }>,
) {
    const source = authoredFixture("provider-manifest", namespace, implementation, options.suffix);
    const files = JSON.parse(source.sourceJson).files as { path: string; content: string }[];
    const definition = files.find((file) => file.path === "definition.json")!;
    definition.content = JSON.stringify({
        ...JSON.parse(definition.content),
        name: options.name,
        version: options.version,
    });
    const admission = await admitProviderManifestJson(definition.content, catalogue);
    return {
        ...source,
        version: options.version,
        canonicalJson: admission.canonicalJson,
        digest: admission.digest,
        sourceJson: JSON.stringify({ files }),
        manifest: encodePublicationUpload({
            kind: "provider-manifest",
            canonicalJson: admission.canonicalJson,
            assets: [],
        }),
        assets: [],
        release: admission.manifest,
    };
}
