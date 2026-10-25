import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { repositoryWriteHeaders } from "@bernouy/cms-repository/repository/namespaces";
import { createHash } from "node:crypto";
import { communityFixture, keyPair, simpleContract } from "./fixtures";

test("owners publish with owner signatures; foreign writes, replacement and stale keys fail", async () => {
    const f = await communityFixture();
    try {
        const writer = new RemoteRepositoryClient(f.base, f.credential);
        const envelope = { kind: "contract" as const, canonicalJson: simpleContract(), assets: [] };
        const published = await writer.push(envelope);
        expect(published.added).toBe(true);
        expect((await writer.push(envelope)).digest).toBe(published.digest);
        await expect(writer.push({ ...envelope, canonicalJson: simpleContract("other") })).rejects.toThrow();
        await expect(
            writer.push({ ...envelope, canonicalJson: simpleContract("community", "1.0.0", "Replaced") }),
        ).rejects.toThrow();
        const intruder = new RemoteRepositoryClient(f.base, {
            ...f.credential,
            resolvePrivateKey: async () => keyPair().privateKey,
        });
        await expect(
            intruder.push({ ...envelope, canonicalJson: simpleContract("community", "1.1.0") }),
        ).rejects.toThrow();
        const replacement = keyPair();
        await f.client.rotate(f.credential, {
            publicKey: replacement.publicKey,
            resolvePrivateKey: async () => replacement.privateKey,
        });
        await expect(
            writer.push({ ...envelope, canonicalJson: simpleContract("community", "1.1.0") }),
        ).rejects.toThrow();
        const newWriter = new RemoteRepositoryClient(f.base, {
            ...f.credential,
            revision: 2,
            resolvePrivateKey: async () => replacement.privateKey,
        });
        expect((await newWriter.push({ ...envelope, canonicalJson: simpleContract("community", "1.1.0") })).added).toBe(
            true,
        );
        const head = await fetch(`${f.base}v1/contracts/community/community.example/1.0.0`, { method: "HEAD" });
        expect(head.status).toBe(200);
        expect(Number(head.headers.get("content-length"))).toBeGreaterThan(0);
        expect(await head.text()).toBe("");
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});

test("signed request replay is rejected and upload handles remain namespace isolated", async () => {
    const f = await communityFixture();
    try {
        const body = Buffer.from(
            JSON.stringify({
                protocol: "ulvia-repository-upload/v1",
                kind: "contract",
                canonicalJson: simpleContract(),
                assets: [],
            }),
        );
        const url = new URL("v1/publication-uploads", f.base);
        const headers = await repositoryWriteHeaders(
            "POST",
            url,
            createHash("sha256").update(body).digest("hex"),
            f.credential,
        );
        const send = () => fetch(url, { method: "POST", headers, body });
        const first = await send();
        expect(first.status).toBe(200);
        const receipt = (await first.json()) as { uploadId: string };
        expect((await send()).status).toBe(401);
        const proof = JSON.parse(Buffer.from(headers["X-Ulvia-Owner-Proof"]!, "base64url").toString());
        const alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_";
        const signature = proof.signature as string;
        const highBits = alphabet.indexOf(signature.at(-1)!) & 48;
        for (let lowBits = 1; lowBits < 16; lowBits++) {
            const alias = { ...proof, signature: signature.slice(0, -1) + alphabet[highBits | lowBits] };
            const aliasHeaders = { "X-Ulvia-Owner-Proof": Buffer.from(JSON.stringify(alias)).toString("base64url") };
            expect((await fetch(url, { method: "POST", headers: aliasHeaders, body })).status).toBe(409);
        }
        const fresh = await repositoryWriteHeaders(
            "POST",
            url,
            createHash("sha256").update(body).digest("hex"),
            f.credential,
        );
        expect((await fetch(url, { method: "POST", headers: fresh, body })).status).toBe(200);
        const otherKey = keyPair();
        await f.client.claim(
            { ...f.credential, namespace: "other", revision: 0, resolvePrivateKey: async () => otherKey.privateKey },
            otherKey.publicKey,
        );
        const commit = new URL(`v1/publication-uploads/${receipt.uploadId}`, f.base);
        const otherHeaders = await repositoryWriteHeaders(
            "POST",
            commit,
            createHash("sha256").update("").digest("hex"),
            { ...f.credential, namespace: "other", resolvePrivateKey: async () => otherKey.privateKey },
        );
        expect((await fetch(commit, { method: "POST", headers: otherHeaders })).status).toBe(409);
        expect((await fetch(`${f.base}v1/contracts/community/community.example/1.0.0`)).status).toBe(404);
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});
