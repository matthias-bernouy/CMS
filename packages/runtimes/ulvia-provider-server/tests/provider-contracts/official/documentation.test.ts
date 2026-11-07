import { expect, test } from "bun:test";
import { sha256Digest } from "@bernouy/binary-media";
import { admitContractBundle, admitContractRelease } from "@bernouy/ulvia-contracts";
import { createInstanceDocumentation } from "../../../src/runtime/instances/composition/documentation";

test("the instance documentation scope follows exact ancestors and rejects substituted parent bytes", async () => {
    const bytes = new TextEncoder().encode("# Shared reference\n\nA parent owns this guide.\n");
    const base = {
        kind: "contract",
        protocol: "ulvia-provider/v1",
        schemaDialect: "ulvia-schema/v1",
        publisherId: "ulvia",
        name: "Example",
        version: "1.0.0",
        capabilities: [
            {
                id: "parent.read",
                access: "admin",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                input: { type: "object", properties: {}, required: [] },
                output: { type: "object", properties: {}, required: [] },
                errors: [],
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/read",
                        response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
                    },
                ],
            },
        ],
    };
    const parent = await admitContractBundle(
        {
            ...base,
            contractId: "ulvia/example.parent",
            documentation: [
                {
                    path: "guide.md",
                    title: "Shared reference",
                    byteLength: bytes.byteLength,
                    digest: await sha256Digest(bytes),
                },
            ],
        },
        [{ id: "docs/guide.md", bytes }],
    );
    const child = await admitContractRelease({
        ...base,
        capabilities: [{ ...base.capabilities[0], id: "child.read" }],
        contractId: "ulvia/example.child",
        extends: { contractId: parent.release.contractId, version: parent.release.version, digest: parent.digest },
    });
    let wrongParent = false;
    let revision = 1;
    let metadataReads = 0;
    let reads = 0;
    const service = await createInstanceDocumentation(
        {
            db: { collection: () => ({ createIndex: async () => "ttl" }) },
            selectionChanges: {
                store: {
                    get: async () => ({
                        revision,
                        plan: {
                            selections: [
                                { contractId: child.release.contractId, version: "1.0.0", digest: child.digest },
                            ],
                        },
                    }),
                },
            },
            releases: {
                get: async (id: string) => {
                    metadataReads++;
                    return { admission: id === child.release.contractId || wrongParent ? child : parent };
                },
                readDocumentation: async (digest: string, path: string) => {
                    reads++;
                    return digest === parent.digest && path === "guide.md" ? new Blob([bytes]) : null;
                },
            },
        } as never,
        {
            model: "unused",
            embed: async () => {
                throw new Error("Direct reads do not use a model");
            },
        },
    );
    const reference = { contractId: parent.release.contractId, releaseDigest: parent.digest, path: "guide.md" };
    expect((await service.get({ reference })).content).toBe(new TextDecoder().decode(bytes));
    expect(reads).toBe(1);
    expect(metadataReads).toBe(2);
    await service.get({ reference });
    expect(metadataReads).toBe(2);
    wrongParent = true;
    revision++;
    await expect(service.get({ reference })).rejects.toThrow("parent digest mismatch");
    expect(reads).toBe(2);
});
