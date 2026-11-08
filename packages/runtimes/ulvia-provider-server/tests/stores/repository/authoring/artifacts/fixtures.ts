import { join } from "node:path";
import { RepositoryAuthoring } from "@bernouy/repository/repository/authoring";
import type { SourceAsset } from "@bernouy/repository/repository/authoring";
import { authoringFixture } from "../fixture";

export const contractId = "community/notes";
export function contractSnapshot(version = "1.0.0") {
    return JSON.stringify({
        files: [
            {
                path: "definition.json",
                content: JSON.stringify({
                    kind: "contract",
                    protocol: "ulvia-provider/v1",
                    schemaDialect: "ulvia-schema/v1",
                    contractId,
                    publisherId: "community",
                    version,
                    name: "Notes",
                }),
            },
            {
                path: "capabilities/queries/read.json",
                content: JSON.stringify({
                    id: "read",
                    access: "public",
                    behavior: { effect: "query", execution: "sync", sensitive: false },
                    input: { type: "object", properties: {}, required: [] },
                    output: { type: "string", maxLength: 128 },
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
                    ],
                    docs: ["overview.md"],
                }),
            },
            { path: "docs/overview.md", content: "# Notes\n\nRead notes from the provider.\n" },
        ],
    });
}
export function providerSnapshot(digest: string, version = "1.0.0") {
    return JSON.stringify({
        files: [
            {
                path: "definition.json",
                content: JSON.stringify({
                    kind: "provider-manifest",
                    protocol: "ulvia-provider/v1",
                    schemaDialect: "ulvia-schema/v1",
                    providerId: "community/notes-provider",
                    version,
                    name: "Notes Provider",
                    provenance: { publisherId: "community", publishedAt: "2026-11-05T00:00:00Z" },
                    buildVersionRange: ">=1.0.0 <2.0.0",
                    endpoint: {
                        allowedOrigins: ["https://provider.example.com"],
                        defaultOrigin: "https://provider.example.com",
                    },
                    configuration: { type: "object", properties: {}, required: [] },
                    credentialSlots: [],
                    implementations: [{ contractId, version: "1.0.0", digest, requires: [] }],
                    requires: [],
                }),
            },
        ],
    });
}
export async function artifactFixture(readAsset?: (asset: SourceAsset) => Promise<Blob>) {
    const f = await authoringFixture();
    const host = {
        root: join(f.root, "preparations"),
        contracts: f.contracts,
        readAsset:
            readAsset ??
            (async () => {
                throw new Error("Unexpected asset read");
            }),
    };
    return { ...f, host, artifacts: new RepositoryAuthoring(host, f.publisher) };
}
