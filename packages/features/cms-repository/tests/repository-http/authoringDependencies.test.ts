import { admitContractBundle } from "@bernouy/ulvia-contracts";
import { RemoteRepositoryClient } from "cms-repository/repository/publication/client";
import { capabilityDocument, contractDocument } from "../../../../platform/contracts/tests/support/fixtures";
import { expect, test } from "bun:test";
import { dependencyReader } from "cms-repository/repository/authoring/resources/dependencies/transport";
import type { CollectionPublisher } from "cms-repository/repository/authoring/CollectionAuthoring";

const publisher = { repositoryUrl: "http://127.0.0.1" } as CollectionPublisher;
test("preparation dependency reads bound concurrency and release all slots after failure", async () => {
    const original = globalThis.fetch;
    let active = 0;
    let maximum = 0;
    try {
        globalThis.fetch = Object.assign(async () => {
            active++;
            maximum = Math.max(maximum, active);
            await new Promise((resolve) => setTimeout(resolve, 2));
            active--;
            return new Response("{}", { status: 503 });
        }, original);
        const read = dependencyReader(publisher);
        const settled = await Promise.allSettled(Array.from({ length: 12 }, () => read("v1/catalogue", {})));
        expect(settled.every((result) => result.status === "rejected")).toBe(true);
        expect(maximum).toBe(4);
        expect(active).toBe(0);
    } finally {
        globalThis.fetch = original;
    }
});
test("preparation dependency reads enforce aggregate bytes and request count", async () => {
    const original = globalThis.fetch;
    let calls = 0;
    try {
        globalThis.fetch = Object.assign(async () => {
            calls++;
            return new Response(new Uint8Array(1024 * 1024));
        }, original);
        const read = dependencyReader(publisher);
        for (let i = 0; i < 8; i++) {
            await read("v1/catalogue", {});
        }
        await expect(read("v1/catalogue", {})).rejects.toThrow("8 MiB");
        expect(calls).toBe(9);
        calls = 0;
        globalThis.fetch = Object.assign(async () => {
            calls++;
            return new Response("{}");
        }, original);
        const bounded = dependencyReader(publisher);
        for (let i = 0; i < 128; i++) {
            await bounded("v1/catalogue", {});
        }
        await expect(bounded("v1/catalogue", {})).rejects.toThrow("128");
        expect(calls).toBe(128);
    } finally {
        globalThis.fetch = original;
    }
});

test("contract fixture downloads cancel rejected responses without consuming their untrusted body", async () => {
    const payload = new Uint8Array([7]);
    const sha = `sha256:${new Bun.CryptoHasher("sha256").update(payload).digest("hex")}`;
    const admission = await admitContractBundle(
        contractDocument({
            capabilities: [
                capabilityDocument({
                    output: { type: "binary", maxBytes: 1024 },
                    bindings: [
                        {
                            transport: "http",
                            method: "POST",
                            path: "/fixture",
                            input: { body: true },
                            response: {
                                successStatuses: [200],
                                contentTypes: ["application/octet-stream"],
                                errorStatuses: { INVALID_RECIPIENT: 422 },
                            },
                        },
                    ],
                    mocks: [
                        {
                            id: "sample",
                            input: { recipient: "reader@example.com", templateId: "sample" },
                            outcome: { kind: "success", output: { assetId: "sample.bin" } },
                        },
                    ],
                }),
            ],
            fixtureAssets: [
                {
                    id: "sample.bin",
                    byteLength: 1,
                    mediaType: "application/octet-stream",
                    digest: sha,
                },
            ],
        }),
        [{ id: "sample.bin", bytes: payload }],
    );
    const original = globalThis.fetch;
    let cancelled = 0;
    try {
        globalThis.fetch = Object.assign(async (url: RequestInfo | URL) => {
            if (String(url).includes("/v1/releases/")) {
                return new Response(admission.canonicalJson, { headers: { etag: admission.digest } });
            }
            return new Response(
                new ReadableStream<Uint8Array>({
                    cancel() {
                        cancelled++;
                    },
                }),
                {
                    headers: { "content-length": "2", etag: sha },
                },
            );
        }, original);
        await expect(
            new RemoteRepositoryClient("http://127.0.0.1").pullContractAsset(
                {
                    kind: "contract",
                    publisherId: admission.release.publisherId,
                    id: admission.release.contractId,
                    version: admission.release.version,
                },
                admission.digest,
                "sample.bin",
            ),
        ).rejects.toThrow("byte limit");
        expect(cancelled).toBe(1);
    } finally {
        globalThis.fetch = original;
    }
});
