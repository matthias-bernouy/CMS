import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { encodePublicationUpload } from "@bernouy/repository/repository/publication";
import { capability } from "../../../fixtures/inventory";

/** A real admitted contract and immutable documentation asset, never a mocked Registry result. */
export async function publicationContract(
    namespace: string,
    version = "1.0.0",
    padding = 0,
    options: Readonly<{ resource?: string; name?: string; description?: string }> = {},
) {
    const bytes = new TextEncoder().encode(
        `# ${options.name ?? "Performance publication"}\n\nImmutable documentation fixture.\n${"x".repeat(padding)}`,
    );
    const asset = {
        id: "docs/readme.md",
        byteLength: bytes.byteLength,
        digest: await sha256Digest(bytes),
        mediaType: "text/markdown",
    };
    const identity = {
        kind: "contract" as const,
        protocol: "ulvia-provider/v1" as const,
        schemaDialect: "ulvia-schema/v1" as const,
        publisherId: namespace,
        contractId: `${namespace}/${options.resource ?? "publication-fixture"}`,
        name: options.name ?? "Performance publication",
        ...(options.description === undefined ? {} : { description: options.description }),
        version,
    };
    const read = { ...capability(), docs: ["readme.md"] };
    const admitted = await admitContractBundleJson(
        JSON.stringify({
            ...identity,
            documentation: [
                { path: "readme.md", title: identity.name, byteLength: asset.byteLength, digest: asset.digest },
            ],
            capabilities: [read],
        }),
        [{ id: asset.id, bytes }],
    );
    const manifest = encodePublicationUpload({
        kind: "contract",
        canonicalJson: admitted.canonicalJson,
        assets: [{ id: asset.id, byteLength: asset.byteLength, digest: asset.digest }],
    });
    const sourceJson = JSON.stringify({
        files: [
            { path: "definition.json", content: JSON.stringify(identity) },
            { path: "capabilities/read.json", content: JSON.stringify(read) },
            { path: asset.id, content: new TextDecoder().decode(bytes) },
        ],
    });
    return {
        ...identity,
        namespace,
        bytes,
        asset,
        manifest,
        sourceJson,
        canonicalJson: admitted.canonicalJson,
        digest: admitted.digest,
    };
}
