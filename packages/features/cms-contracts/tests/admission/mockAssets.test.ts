import { describe, expect, test } from "bun:test";
import {
    admitContractBundle,
    admitContractBundleJson,
    admitContractRelease,
    computeReleaseDigest,
    parseContractRelease,
} from "@bernouy/cms-contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-contracts/catalogue";
import { capabilityDocument, contractDocument, objectSchema } from "../support/fixtures";

const input = { recipient: "reader@example.com", templateId: "welcome" };
const success = { kind: "success", output: { messageId: "message-1" } };
const assetBytes = new Uint8Array(
    await Bun.file(new URL("../../fixtures/protocol-v1/mock-assets/receipt.svg", import.meta.url)).arrayBuffer(),
);
const asset = {
    id: "receipt.svg",
    mediaType: "image/svg+xml",
    byteLength: 200,
    digest: "sha256:61cc3d4fd2135663e047b9dfab68367dedf9df8e2516dded57257a06463ffaa9",
};

function binaryRelease(overrides: Record<string, unknown> = {}): Record<string, unknown> {
    return contractDocument({
        fixtureAssets: [asset],
        capabilities: [
            capabilityDocument({
                output: { type: "binary", maxBytes: 1024, mediaTypes: ["image/svg+xml"] },
                binding: {
                    transport: "http",
                    method: "POST",
                    path: "/v1/messages",
                    input: { body: true },
                    response: { successStatuses: [200], contentTypes: ["image/svg+xml"] },
                },
                mocks: [{ id: "sample", input, outcome: { kind: "success", output: { assetId: asset.id } } }],
                ...overrides,
            }),
        ],
    });
}

describe("contract mock assets", () => {
    test("admits the authored JSON fixture with its binary file", async () => {
        const json = await Bun.file(new URL("../../fixtures/protocol-v1/mock.contract.json", import.meta.url)).text();
        const admitted = await admitContractBundleJson(json, [{ id: asset.id, bytes: assetBytes }]);
        expect(admitted.digest).toBe("sha256:00d6488f5216597efa8f4dc0d603f02de6a52b23f80b6b5f5286fa26835ca56f");
        expect(admitted.release.capabilities[0]?.mocks).toHaveLength(2);
    });

    test("verifies fixture bytes before admitting and publishing a bundle", async () => {
        const release = binaryRelease();
        await expect(admitContractRelease(release)).rejects.toThrow("admitContractBundle");
        await expect(computeReleaseDigest(release)).rejects.toThrow("admitContractBundle");
        const admitted = await admitContractBundle(release, [{ id: asset.id, bytes: assetBytes }]);
        const fromJson = await admitContractBundleJson(JSON.stringify(release), [
            { id: asset.id, bytes: new Blob([assetBytes]) },
        ]);
        expect(fromJson.digest).toBe(admitted.digest);
        expect(admitted.fixtureAssets?.[0]?.bytes.size).toBe(assetBytes.byteLength);
        const catalogue = new InMemoryReleaseCatalogue();
        expect((await catalogue.publish(admitted)).admission.digest).toBe(admitted.digest);
    });

    test("rejects missing, extra, altered, and misdeclared bytes", async () => {
        const release = binaryRelease();
        await expect(admitContractBundle(release, [])).rejects.toThrow("asset set");
        await expect(admitContractBundle(release, [{ id: "wrong", bytes: assetBytes }])).rejects.toThrow("missing");
        await expect(admitContractBundle(release, [{ id: asset.id, bytes: new Uint8Array(200) }])).rejects.toThrow(
            "digest mismatch",
        );
        expect(() =>
            parseContractRelease({ ...release, fixtureAssets: [{ ...asset, mediaType: "application/pdf" }] }),
        ).toThrow("incompatible or undeclared");
        expect(() => parseContractRelease({ ...release, fixtureAssets: [{ ...asset, byteLength: 1025 }] })).toThrow(
            "incompatible or undeclared",
        );
    });

    test("rechecks asset bytes at catalogue publication", async () => {
        const admitted = await admitContractBundle(binaryRelease(), [{ id: asset.id, bytes: assetBytes }]);
        const forged = { ...admitted, fixtureAssets: [{ id: asset.id, bytes: new Blob([new Uint8Array(200)]) }] };
        await expect(new InMemoryReleaseCatalogue().publish(forged)).rejects.toThrow("digest mismatch");
    });

    test("accepts a binary input body mock referencing the same verified asset", async () => {
        const release = contractDocument({
            fixtureAssets: [asset],
            capabilities: [
                capabilityDocument({
                    input: objectSchema(
                        { attachment: { type: "binary", maxBytes: 1024, mediaTypes: ["image/svg+xml"] } },
                        ["attachment"],
                    ),
                    binding: {
                        transport: "http",
                        method: "POST",
                        path: "/v1/messages",
                        input: { body: { binaryProperty: "attachment" } },
                        response: { successStatuses: [200], contentTypes: ["application/json"] },
                    },
                    mocks: [{ id: "upload", input: { attachment: { assetId: asset.id } }, outcome: success }],
                }),
            ],
        });
        expect((await admitContractBundle(release, [{ id: asset.id, bytes: assetBytes }])).fixtureAssets).toHaveLength(
            1,
        );
        const malformed = structuredClone(release) as Record<string, unknown>;
        const capability = (malformed.capabilities as Record<string, unknown>[])[0]!;
        capability.mocks = [
            { id: "upload", input: { attachment: { assetId: asset.id, extra: true } }, outcome: success },
        ];
        expect(() => parseContractRelease(malformed)).toThrow("binary mock value must be");
    });
});
