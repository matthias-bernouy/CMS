import { afterEach, expect, test } from "bun:test";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FilesystemRepositoryNamespaceStore } from "@bernouy/cms-repository/repository/filesystem";
import {
    RepositoryNamespaceAuthority,
    repositoryDigest,
    signNamespaceProof,
} from "@bernouy/cms-repository/repository/namespaces";

const roots: string[] = [];
afterEach(async () => {
    await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function keys() {
    const pair = generateKeyPairSync("ed25519");
    return {
        publicKey: pair.publicKey.export({ type: "spki", format: "der" }).toString("base64url"),
        privateKey: pair.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
    };
}

function proof(
    key: ReturnType<typeof keys>,
    namespace: string,
    revision: number,
    action: string,
    digest: string,
    subject = namespace,
) {
    return signNamespaceProof(
        {
            repositoryId: "repository-1",
            namespace,
            revision,
            action,
            subject,
            digest,
            timestamp: Date.now(),
            nonce: randomUUID(),
        },
        key.privateKey,
    );
}

async function fixture() {
    const root = await mkdtemp(join(tmpdir(), "repository-namespace-"));
    roots.push(root);
    const store = new FilesystemRepositoryNamespaceStore(root);
    return { root, store, authority: new RepositoryNamespaceAuthority("repository-1", store) };
}

test("claims one namespace atomically across independent storage instances", async () => {
    const { root, authority } = await fixture();
    const other = new RepositoryNamespaceAuthority("repository-1", new FilesystemRepositoryNamespaceStore(root));
    const first = keys();
    const second = keys();
    const results = await Promise.allSettled(
        [first, second].map((key, index) =>
            (index === 0 ? authority : other).claim(
                "community",
                key.publicKey,
                proof(key, "community", 0, "claim", repositoryDigest({ publicKey: key.publicKey })),
            ),
        ),
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect((await authority.get("community"))?.revision).toBe(1);
});

test("rotation requires both keys and rejects stale, cross-namespace and cross-repository writes", async () => {
    const { root, store, authority } = await fixture();
    const old = keys();
    const replacement = keys();
    await authority.claim(
        "community",
        old.publicKey,
        proof(old, "community", 0, "claim", repositoryDigest({ publicKey: old.publicKey })),
    );
    const digest = repositoryDigest({ publicKey: replacement.publicKey });
    await expect(
        authority.rotate(
            "community",
            replacement.publicKey,
            proof(old, "community", 1, "rotate", digest),
            proof(old, "community", 1, "accept-key", digest),
        ),
    ).rejects.toThrow();
    const rotated = await authority.rotate(
        "community",
        replacement.publicKey,
        proof(old, "community", 1, "rotate", digest),
        proof(replacement, "community", 1, "accept-key", digest),
    );
    expect(rotated.revision).toBe(2);
    expect((await store.get("community", 1))?.publicKey).toBe(old.publicKey);
    const write = proof(old, "community", 1, "publish", repositoryDigest(null));
    await expect(
        authority.execute("community", "publish", "community", write.digest, write, async () => true),
    ).rejects.toThrow();
    await expect(
        authority.execute("other", "publish", "community", write.digest, write, async () => true),
    ).rejects.toThrow();
    const otherRepository = new RepositoryNamespaceAuthority(
        "repository-2",
        new FilesystemRepositoryNamespaceStore(root),
    );
    const current = proof(replacement, "community", 2, "publish", write.digest);
    await expect(
        otherRepository.execute("community", "publish", "community", current.digest, current, async () => true),
    ).rejects.toThrow();
});

test("revocation is terminal and cannot be reclaimed", async () => {
    const { authority } = await fixture();
    const key = keys();
    const claim = proof(key, "community", 0, "claim", repositoryDigest({ publicKey: key.publicKey }));
    await authority.claim("community", key.publicKey, claim);
    await authority.claim("community", key.publicKey, claim);
    await authority.revoke("community", proof(key, "community", 1, "revoke", repositoryDigest(null)));
    await expect(authority.claim("community", key.publicKey, claim)).rejects.toThrow();
    const write = proof(key, "community", 2, "publish", repositoryDigest(null));
    await expect(
        authority.execute("community", "publish", "community", write.digest, write, async () => true),
    ).rejects.toThrow();
});
