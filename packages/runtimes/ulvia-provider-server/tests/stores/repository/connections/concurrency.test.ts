import { expect, test } from "bun:test";
import { CmsSecrets, CmsSecretNamespaceStore } from "@bernouy/secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/secrets/memory";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { PublisherConnection } from "../../../../src/runtime/stores/repository/connection";
import { repositoryPeer } from "../peer";

async function stores() {
    const service = new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore());
    const credentials = await service.createNamespace({
        name: "connection-test",
        createdBy: { kind: "administrator", id: "test" },
    });
    return { service, credentials, open: () => new CmsSecretNamespaceStore(service, credentials) };
}

test("ten concurrent configurations and disconnections share the current instance mutation scope", async () => {
    const peer = repositoryPeer();
    const f = await stores();
    const scope = crypto.randomUUID();
    const connections = [f.open(), f.open()].map(
        (store) => new PublisherConnection(store, peer.url, false, undefined, scope),
    );
    try {
        await Promise.all(Array.from({ length: 10 }, (_, i) => connections[i % 2]!.configure(peer.token)));
        expect((await connections[0]!.view()).configured).toBe(true);
        expect(
            (await f.service.getByName(f.credentials.namespaceId, f.credentials.namespaceKey, "REPOSITORY_CONNECTION"))
                ?.version,
        ).toBe(10);
        await Promise.all(Array.from({ length: 10 }, (_, i) => connections[i % 2]!.disconnect()));
        expect((await connections[0]!.view()).configured).toBe(false);
        expect(await f.open().get("REPOSITORY_CONNECTION")).toBeNull();
    } finally {
        peer.close();
    }
});

test("a disconnect arriving during PAT verification wins over that older configuration", async () => {
    const peer = repositoryPeer();
    const f = await stores();
    const scope = crypto.randomUUID();
    const ready = Promise.withResolvers<void>();
    const resume = Promise.withResolvers<void>();
    let blocked = true;
    const connection = new PublisherConnection(
        f.open(),
        peer.url,
        false,
        async (url, init) => {
            if (blocked && new URL(String(url)).pathname.endsWith("v1/namespaces")) {
                blocked = false;
                ready.resolve();
                await resume.promise;
            }
            return fetch(url, init);
        },
        scope,
    );
    const other = new PublisherConnection(f.open(), peer.url, false, undefined, scope);
    const configure = connection.configure(peer.token);
    void configure.catch(() => undefined);
    let disconnect: Promise<unknown> | undefined;
    try {
        await ready.promise;
        disconnect = other.disconnect();
        resume.resolve();
        await Promise.all([configure, disconnect]);
        expect((await other.view()).configured).toBe(false);
        expect(await f.open().get("REPOSITORY_CONNECTION")).toBeNull();
    } finally {
        resume.resolve();
        await Promise.allSettled([configure, disconnect]);
        peer.close();
    }
});
