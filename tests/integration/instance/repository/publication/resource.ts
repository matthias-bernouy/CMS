import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundleJson } from "@bernouy/ulvia-contracts";
import { encodePublicationUpload } from "@bernouy/cms-repository/repository/publication";

export async function sampleContract(namespace: string, version = "1.0.0") {
    const bytes = new TextEncoder().encode("# Greeting examples\n\nVerified immutable fixture bytes.\n");
    const asset = {
        id: "docs/readme.md",
        byteLength: bytes.byteLength,
        digest: await sha256Digest(bytes),
        mediaType: "text/markdown",
    };
    const admission = await admitContractBundleJson(
        JSON.stringify({
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId: `${namespace}.greeting`,
            publisherId: namespace,
            version,
            name: "Greeting examples",
            description: "Reusable greeting examples for the Repository journey.",
            documentation: [
                { path: "readme.md", title: "Greeting examples", byteLength: asset.byteLength, digest: asset.digest },
            ],
            capabilities: [
                {
                    id: "greeting",
                    docs: ["readme.md"],
                    access: "public",
                    behavior: { effect: "query", execution: "sync", sensitive: false },
                    input: { type: "object", properties: {}, required: [] },
                    output: { type: "string", maxLength: 32 },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "GET",
                            path: "/greeting",
                            input: {},
                            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                        },
                    ],
                },
            ],
        }),
        [{ id: asset.id, bytes }],
    );
    const manifest = new TextDecoder().decode(
        encodePublicationUpload({
            kind: "contract",
            canonicalJson: admission.canonicalJson,
            assets: [{ id: asset.id, byteLength: asset.byteLength, digest: asset.digest }],
        }),
    );
    return { bytes, asset, manifest, digest: admission.digest, id: admission.release.contractId, version, namespace };
}
