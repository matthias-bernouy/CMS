import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { communityFixture, keyPair, capabilityProof, simpleContract } from "./fixtures";

test("legal namespace names cannot collide with admitted action routes", async () => {
    const f = await communityFixture();
    try {
        for (const namespace of ["claim", "rotate", "revoke"]) {
            const credential = { ...f.credential, namespace, revision: 0 };
            expect((await f.client.claim(credential, f.key.publicKey)).revision).toBe(1);
            expect((await f.client.get(namespace))?.publicKey).toBe(f.key.publicKey);
            const replacement = keyPair();
            expect(
                (
                    await f.client.rotate(
                        { ...credential, revision: 1 },
                        { publicKey: replacement.publicKey, resolvePrivateKey: async () => replacement.privateKey },
                    )
                ).revision,
            ).toBe(2);
            expect(
                (
                    await f.client.revoke({
                        ...credential,
                        revision: 2,
                        resolvePrivateKey: async () => replacement.privateKey,
                    })
                ).revoked,
            ).toBe(true);
        }
        const namespace = "direct";
        const credential = { ...f.credential, namespace, revision: 0 };
        const response = await fetch(`${f.base}v1/namespace-actions/claim`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                namespace,
                publicKey: f.key.publicKey,
                proof: capabilityProof(credential, f.key.privateKey, "claim", namespace, {
                    publicKey: f.key.publicKey,
                }),
            }),
        });
        expect(response.status).toBe(200);
        expect((await f.client.get(namespace))?.revision).toBe(1);
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});

test("admitted binary GET and HEAD preserve missing-resource errors", async () => {
    const f = await communityFixture();
    try {
        const path = `${f.base}v1/releases/contract/community/missing/1.0.0`;
        expect((await fetch(path)).status).toBe(404);
        const head = await fetch(path, { method: "HEAD" });
        expect(head.status).toBe(404);
        expect(head.headers.get("x-ulvia-error-code")).toBe("NOT_FOUND");
        expect(head.headers.get("x-ulvia-request-id")).toBeTruthy();
        expect(head.headers.get("content-type")).toBeNull();
        expect(await head.text()).toBe("");
        await new RemoteRepositoryClient(f.base, f.credential).push({
            kind: "contract",
            canonicalJson: simpleContract(),
            assets: [],
        });
        const success = await fetch(`${f.base}v1/releases/contract/community/community.example/1.0.0`, {
            method: "HEAD",
        });
        expect(success.status).toBe(200);
        expect(Number(success.headers.get("content-length"))).toBeGreaterThan(0);
        expect(await success.text()).toBe("");
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});

test("Repository exposes its HTTP contract and never mounts a standalone MCP", async () => {
    const f = await communityFixture();
    try {
        const response = await f.application.handle(new Request(`${f.base}mcp`, { method: "POST", body: "{}" }));
        expect(response.status).toBe(404);
        const contract = (await (await fetch(`${f.base}v1/repository-contract`)).json()) as {
            version: string;
            capabilities: { bindings: { transport: string }[] }[];
        };
        expect(contract.version).toBe("0.2.0");
        expect(
            contract.capabilities.every((capability) =>
                capability.bindings.every((binding) => binding.transport === "http"),
            ),
        ).toBe(true);
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});
