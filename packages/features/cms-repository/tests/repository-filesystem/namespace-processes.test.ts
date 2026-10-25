import { expect, test } from "bun:test";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { tmpdir } from "node:os";
import { FilesystemRepositoryNamespaceStore } from "@bernouy/cms-repository/repository/filesystem";
import {
    RepositoryNamespaceAuthority,
    repositoryDigest,
    signNamespaceProof,
} from "@bernouy/cms-repository/repository/namespaces";

test("namespace claims serialize across actual Bun processes and crash leftovers stay invisible", async () => {
    const root = await mkdtemp(join(tmpdir(), "namespace-processes-"));
    const keys = [generateKeyPairSync("ed25519"), generateKeyPairSync("ed25519")];
    const candidates = keys.map((key) => {
        const publicKey = key.publicKey.export({ type: "spki", format: "der" }).toString("base64url");
        const proof = signNamespaceProof(
            {
                repositoryId: "repository-1",
                namespace: "community",
                revision: 0,
                action: "claim",
                subject: "community",
                digest: repositoryDigest({ publicKey }),
                timestamp: Date.now(),
                nonce: randomUUID(),
            },
            key.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
        );
        return { publicKey, proof };
    });
    const script = `import { FilesystemRepositoryNamespaceStore } from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryNamespaceAuthority } from "@bernouy/cms-repository/repository/namespaces";
const candidate = JSON.parse(process.env.ULVIA_TEST_CANDIDATE);
const authority = new RepositoryNamespaceAuthority("repository-1", new FilesystemRepositoryNamespaceStore(process.env.ULVIA_TEST_ROOT));
try { await authority.claim("community", candidate.publicKey, candidate.proof); } catch { process.exit(2); }`;
    try {
        const children = candidates.map((candidate) =>
            Bun.spawn([process.execPath, "-e", script], {
                cwd: resolve(import.meta.dir, "../../../../.."),
                env: { ...process.env, ULVIA_TEST_CANDIDATE: JSON.stringify(candidate), ULVIA_TEST_ROOT: root },
                stdout: "ignore",
                stderr: "pipe",
            }),
        );
        const results = await Promise.all(children.map((child) => child.exited));
        expect(results.sort()).toEqual([0, 2]);
        const store = new FilesystemRepositoryNamespaceStore(root);
        const current = (await store.get("community"))!;
        const winner = candidates.findIndex((candidate) => candidate.publicKey === current.publicKey);
        expect(winner).toBeGreaterThanOrEqual(0);
        const orphan = join(root, ".namespaces/community/2.json");
        await writeFile(orphan, "uncommitted partial revision");
        expect(await store.get("community", 2)).toBeNull();
        const next = candidates[1 - winner]!;
        const make = (action: string, key: (typeof keys)[number]) =>
            signNamespaceProof(
                {
                    repositoryId: "repository-1",
                    namespace: "community",
                    revision: 1,
                    action,
                    subject: "community",
                    digest: repositoryDigest({ publicKey: next.publicKey }),
                    timestamp: Date.now(),
                    nonce: randomUUID(),
                },
                key.privateKey.export({ type: "pkcs8", format: "pem" }).toString(),
            );
        const owner = make("rotate", keys[winner]!);
        const replacement = make("accept-key", keys[1 - winner]!);
        const authority = new RepositoryNamespaceAuthority("repository-1", store);
        const rotated = await authority.rotate("community", next.publicKey, owner, replacement);
        expect(await authority.rotate("community", next.publicKey, owner, replacement)).toEqual(rotated);
        expect((await store.get("community", 1))?.publicKey).toBe(current.publicKey);
        expect((await store.get("community", 2))?.publicKey).toBe(next.publicKey);
        expect(await readFile(orphan, "utf8")).not.toBe("uncommitted partial revision");
    } finally {
        await rm(root, { recursive: true, force: true });
    }
});
