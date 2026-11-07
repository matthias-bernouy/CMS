import { expect, test } from "bun:test";
import { contractBinary, defineCapability, defineFeature, z } from "@bernouy/ulvia-sdk";
import { compileContract } from "@bernouy/ulvia-sdk/build";
function binaryContract(bytes: Uint8Array) {
    return defineFeature({
        contractId: "example/binary",
        name: "Binary",
        publisherId: "example",
        version: "1.0.0",
        fixtures: [{ id: "receipt", mediaType: "application/octet-stream", bytes }],
        capabilities: [
            defineCapability({
                input: z.strictObject({}),
                output: contractBinary({ maxBytes: 4 }),
                errors: {},
                mocks: [{ id: "bytes", input: {}, outcome: { kind: "success", output: { assetId: "receipt" } } }],
                access: "public",
                behavior: { effect: "query", execution: "sync", sensitive: false },
                bindings: [
                    {
                        id: "http",
                        transport: "http",
                        method: "GET",
                        path: "/bytes",
                        response: {
                            contentTypes: ["application/octet-stream"],
                            successStatuses: [200],
                            errorStatuses: {},
                        },
                    },
                ],
                id: "binary.read",
            }),
        ],
    });
}
test("binary mocks reference bounded immutable assets whose metadata is generated and verified", async () => {
    const bytes = new Uint8Array([1, 2, 3, 4]);
    const pending = compileContract(binaryContract(bytes));
    bytes[0] = 255;
    const admission = await pending;
    expect(admission.release.fixtureAssets![0]).toMatchObject({ id: "receipt", byteLength: 4 });
    expect(new Uint8Array(await admission.fixtureAssets![0]!.bytes.arrayBuffer())).toEqual(
        new Uint8Array([1, 2, 3, 4]),
    );
    await expect(compileContract(binaryContract(new Uint8Array(5)))).rejects.toThrow();
    const missing = binaryContract(new Uint8Array(4));
    await expect(compileContract({ ...missing, fixtures: [] })).rejects.toThrow();
});
test("fixture count and build byte limits refuse oversized sources before hashing", async () => {
    const source = binaryContract(new Uint8Array(4));
    await expect(
        compileContract({
            ...source,
            fixtures: [
                { id: "huge", mediaType: "application/octet-stream", bytes: new Uint8Array(16 * 1024 * 1024 + 1) },
            ],
        }),
    ).rejects.toThrow("byte budget");
    await expect(
        compileContract({ ...source, fixtures: Array.from({ length: 257 }, () => source.fixtures[0]!) }),
    ).rejects.toThrow("Too many");
});
