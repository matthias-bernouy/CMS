import { expect, test } from "bun:test";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { RepositoryPublisher } from "../../../src/runtime/stores/repository/RepositoryPublisher";
import { repositoryPeer } from "./peer";

test("account inventory is live, paginated and bounded without local names or per-name requests", async () => {
    const peer = repositoryPeer();
    const secrets = new InMemorySecretStore();
    const publisher = () => new RepositoryPublisher(peer.url, "test", secrets);
    try {
        const p = publisher();
        await p.configureConnection(peer.token);
        expect((await p.listNamespaces()).items).toEqual([]);
        await p.claim("community.z");
        await p.claim("community.a");
        peer.state.calls.length = 0;
        const first = await publisher().listNamespaces({ limit: 1 });
        expect(first.items.map((item) => item.namespace)).toEqual(["community.a"]);
        expect(first.nextCursor).toBe("community.a");
        expect(peer.state.calls.map((call) => call.path)).toEqual(["v1/info", "v1/namespaces"]);
        const second = await p.listNamespaces({ cursor: first.nextCursor!, limit: 1 });
        expect(second.items[0]!.namespace).toBe("community.z");
        expect(second.nextCursor).toBeNull();
        expect((await p.credential("community.a")).revision).toBe(1);
        peer.state.entries[0]!.state = "suspended";
        peer.state.entries.splice(1, 1);
        expect((await p.listNamespaces()).items.map((item) => item.access)).toEqual(["suspended"]);
        await expect(p.credential("community.a")).rejects.toThrow("does not own");
        await expect(p.credential("community.z")).rejects.toThrow("does not own");
        peer.state.calls.length = 0;
        await expect(p.listNamespaces({ limit: 33 })).rejects.toThrow("Invalid");
        expect(peer.state.calls.length).toBe(0);
        expect(JSON.stringify(await p.listNamespaces())).not.toContain(peer.token);
        peer.state.entries.push(
            ...Array.from({ length: 32 }, (_, i) => ({
                namespace: `community.n${i}`,
                state: "active" as const,
                revision: 1,
                updatedAt: new Date().toISOString(),
            })),
        );
        await expect(p.listNamespaces()).rejects.toThrow("invalid namespace inventory");
    } finally {
        peer.close();
    }
});
