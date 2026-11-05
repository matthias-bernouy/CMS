import { resourcePublisher } from "@bernouy/cms-repository/contracts/protocol";
import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundle } from "@bernouy/cms-repository/contracts";
import type { DocumentationEmbeddings, DocumentationSource } from "@bernouy/cms-documentation";

export async function fixture(
    contractId = "example/example.documents",
    large = false,
    overrides?: { texts: readonly string[]; version: string },
) {
    contractId = contractId.includes("/") ? contractId : `example/${contractId}`;
    const texts = overrides
        ? [...overrides.texts]
        : [
              "# Concurrent page editing\n\n## Revision conflicts\n\nRead the current revision, reconcile changes, then verify the saved result.\n",
              "# Upload a file\n\nSend binary bytes to the authorized upload endpoint and complete the upload.\n" +
                  (large ? "😀 content ".repeat(6000) : ""),
          ];
    const assets = texts.map((text, index) => ({
        id: `docs/guide-${index}.md`,
        bytes: new TextEncoder().encode(text),
    }));
    const documentation = await Promise.all(
        assets.map(async (asset, index) => ({
            path: `guide-${index}.md`,
            title: index ? "Upload a file" : "Concurrent page editing",
            byteLength: asset.bytes.byteLength,
            digest: await sha256Digest(asset.bytes),
        })),
    );
    const admission = await admitContractBundle(
        {
            kind: "contract",
            protocol: "ulvia-provider/v1",
            schemaDialect: "ulvia-schema/v1",
            contractId,
            publisherId: resourcePublisher(contractId),
            name: "Documentation",
            version: overrides?.version ?? "1.0.0",
            documentation,
            capabilities: [
                {
                    id: "read",
                    access: "admin",
                    behavior: { effect: "query", execution: "sync", sensitive: false },
                    docs: ["guide-0.md"],
                    input: { type: "object", properties: {}, required: [] },
                    output: { type: "object", properties: {}, required: [] },
                    errors: [],
                    bindings: [
                        {
                            id: "http",
                            transport: "http",
                            method: "GET",
                            path: "/read",
                            input: {},
                            response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                        },
                        { id: "mcp", transport: "mcp", tool: { name: "read_documents" } },
                    ],
                },
            ],
        },
        assets,
    );
    let revision = "1";
    let current = true;
    let reads = 0;
    const source: DocumentationSource = {
        resolve: async () => ({ revision, releases: [admission] }),
        isCurrent: async (expected) => current && expected === revision,
        read: async (ref) => {
            reads++;
            return admission.documentationAssets?.find((asset) => asset.id === `docs/${ref.path}`)?.bytes ?? null;
        },
    };
    const calls: { kind: string; size: number }[] = [];
    const model: DocumentationEmbeddings = {
        model: "deterministic-multilingual-test-v1",
        async embed(values, kind) {
            calls.push({ kind, size: values.length });
            return values.map((text) => (kind === "query" ? [1, 0] : text.includes("revision") ? [1, 0] : [0, 1]));
        },
    };
    return {
        admission,
        texts,
        source,
        model,
        calls,
        reads: () => reads,
        revise: () => {
            revision = "2";
        },
        changeDuringRead: () => {
            current = false;
        },
    };
}
