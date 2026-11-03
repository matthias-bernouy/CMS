import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { RepositoryConnection } from "@bernouy/cms-repository/repository/namespaces";
import { RepositoryPublisher } from "../../../src/runtime/stores/repository/RepositoryPublisher";
import { PublisherConnection } from "../../../src/runtime/stores/repository/connection";
import { repositoryPeer } from "./peer";

test("PAT configuration verifies membership, persists one pinned secret and reveals only status", async () => {
    const peer = repositoryPeer();
    const secrets = new InMemorySecretStore();
    const publisher = () => new RepositoryPublisher(peer.url, "test", secrets);
    try {
        expect(await publisher().connectionStatus()).toEqual({
            configured: false,
            repositoryUrl: peer.url,
            repositoryId: null,
        });
        await expect(publisher().credential("community")).rejects.toThrow("not configured");
        const status = await publisher().configureConnection(peer.token);
        expect(status).toEqual({ configured: true, repositoryUrl: peer.url, repositoryId: "repository-test" });
        expect(await secrets.listKeys()).toEqual(["REPOSITORY_CONNECTION"]);
        expect(JSON.stringify(status)).not.toContain(peer.token);
        expect(await publisher().connectionStatus()).toEqual(status);
        const persisted = await secrets.get("REPOSITORY_CONNECTION");
        await expect(publisher().configureConnection(`pat_${"b".repeat(43)}`)).rejects.toThrow("401");
        expect(await secrets.get("REPOSITORY_CONNECTION")).toBe(persisted);
        await expect(publisher().configureConnection("invalid")).rejects.toThrow("Invalid");
        expect(await secrets.get("REPOSITORY_CONNECTION")).toBe(persisted);
        await publisher().disconnectConnection();
        expect(await secrets.listKeys()).toEqual([]);
        expect((await publisher().connectionStatus()).configured).toBe(false);
    } finally {
        peer.close();
    }
});

test("changed identity, origin, redirects and revoked PATs cannot forward or replace credentials", async () => {
    const peer = repositoryPeer();
    const secrets = new InMemorySecretStore();
    const connection = new PublisherConnection(secrets, peer.url, false);
    try {
        await connection.configure(peer.token);
        const credential = await connection.credential();
        expect(() => new RepositoryConnection("https://another.example", credential)).toThrow("different origin");
        peer.state.calls.length = 0;
        peer.state.repositoryId = "changed";
        const remote = new RepositoryConnection(peer.url, credential);
        await expect(remote.json("v1/namespaces", "GET", undefined, true)).rejects.toThrow("identity changed");
        await expect(connection.configure(peer.token)).rejects.toThrow("identity changed");
        expect(peer.state.calls.every((call) => call.authorization === null)).toBe(true);
        peer.state.repositoryId = "repository-test";
        peer.state.revoked = true;
        await expect(remote.json("v1/namespaces", "GET", undefined, true)).rejects.toThrow("401");
        peer.state.revoked = false;
        peer.state.redirect = true;
        await expect(remote.json("v1/namespaces", "GET", undefined, true)).rejects.toThrow();
        expect(peer.state.calls.some((call) => call.path.includes("unexpected"))).toBe(false);
    } finally {
        peer.close();
    }
});

test("disconnect, replacement and invalid stored connections never regenerate or reuse authority", async () => {
    const peer = repositoryPeer();
    const secrets = new InMemorySecretStore();
    const connection = new PublisherConnection(secrets, peer.url, false);
    try {
        await connection.configure(peer.token);
        const credential = await connection.credential();
        await connection.configure(peer.token);
        await expect(credential.resolveToken()).rejects.toThrow("changed");
        const replacement = await connection.credential();
        await connection.disconnect();
        await expect(replacement.resolveToken()).rejects.toThrow("changed");
        for (const invalid of ["{", "null", JSON.stringify({ schema: "old-signing-key" }), "x".repeat(1025)]) {
            await secrets.set("REPOSITORY_CONNECTION", invalid);
            await expect(connection.credential()).rejects.toThrow("Invalid stored");
            expect(await secrets.get("REPOSITORY_CONNECTION")).toBe(invalid);
        }
        await connection.disconnect();
        expect(await secrets.listKeys()).toEqual([]);
    } finally {
        peer.close();
    }
});
