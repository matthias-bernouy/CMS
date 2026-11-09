import { encodePublicationUpload, parsePublicationUpload } from "repository/repository/publication/protocol";
import { expect, test } from "bun:test";
import { join } from "node:path";
import { compileCollectionSources } from "repository/exports/repository/authoring/build";
import { FilesystemRepositoryPublicationRegistry } from "repository/repository/filesystem/mutations/publicationRegistry";
import { FilesystemRepositorySourceStore } from "repository/repository/sources/filesystem";
import { RepositorySourceClient } from "repository/repository/sources/client";
import { parseSourceSnapshot } from "repository/repository/authoring/snapshot";
import { sourceFixture } from "../../../../../../../tests/fixtures/repository/sourceBuild";
import { ownerFixture, jsonRequest } from "../../publicationFixtures";

test("large escaped sources survive compilation, durable retention and the account-authorized HTTP read", async () => {
    const f = await sourceFixture();
    const root = join(f.root, "repository");
    const { application: app, owner, credential } = await ownerFixture(root);
    const other = await app.account("other-owner");
    const previousFetch = globalThis.fetch;
    try {
        const snapshot = JSON.parse(f.captured.sourceJson);
        for (let index = 0; index < 4; index++) {
            snapshot.files.push({
                path: `translations/en/padded-${index}.json`,
                content: JSON.stringify({ [`extra.${index}`]: "Unused" }) + "\n".repeat(1024 * 1024 - 8192),
            });
        }
        const sourceJson = JSON.stringify(snapshot);
        expect(Buffer.byteLength(sourceJson)).toBeGreaterThan(7 * 1024 * 1024);
        parseSourceSnapshot(sourceJson);
        const built = await compileCollectionSources(join(f.root, "large-build"), sourceJson, f.captured.assets);
        await new FilesystemRepositoryPublicationRegistry(root).publish({
            kind: "collection",
            canonicalJson: built.admission.canonicalJson,
            assets: built.admission.assets,
            sourceJson: built.sourceJson,
        });
        const expected = { sourceJson: built.sourceJson, releaseDigest: built.admission.digest };
        expect(await new FilesystemRepositorySourceStore(root).get("publisher", "publisher/kit", "1.0.0")).toEqual(
            expected,
        );
        const input = {
            kind: "collection",
            namespace: "publisher",
            namespaceRevision: 1,
            id: "publisher/kit",
            version: "1.0.0",
        };
        for (const token of [other.token, "invalid"]) {
            const response = await app.handle(jsonRequest("/v1/source-snapshots/read", token, input, "QUERY"));
            expect([401, 403, 409]).toContain(response.status);
        }
        expect(
            (
                await app.handle(
                    jsonRequest("/v1/source-snapshots/read", owner.token, { ...input, namespaceRevision: 2 }, "QUERY"),
                )
            ).status,
        ).toBe(409);
        expect(
            (
                await app.handle(
                    jsonRequest("/v1/source-snapshots/read", owner.token, { ...input, id: "foreign/kit" }, "QUERY"),
                )
            ).status,
        ).toBe(409);
        const old = await app.handle(
            jsonRequest(
                "/v1/source-snapshots",
                owner.token,
                { namespace: "publisher", namespaceRevision: 1, collectionId: "publisher/kit", version: "1.0.0" },
                "QUERY",
            ),
        );
        expect(old.status).toBe(409);
        globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) =>
            app.handle(new Request(input, init))) as typeof fetch;
        const client = new RepositorySourceClient("https://repository.example", credential);
        expect(await client.get("publisher/kit", "1.0.0")).toEqual(expected);
        expect(await new FilesystemRepositorySourceStore(root).get("publisher", "publisher/kit", "1.0.0")).toEqual(
            expected,
        );
    } finally {
        globalThis.fetch = previousFetch;
        await app.close();
        await f.close();
    }
});

test("source writes above the UTF-8 budget are refused before storage mutation", async () => {
    const f = await sourceFixture();
    const store = new FilesystemRepositorySourceStore(join(f.root, "refused"));
    try {
        await expect(
            store.putArtifact("contract", "publisher", "publisher/kit", "1.0.0", {
                sourceJson: "😀".repeat(2 * 1024 * 1024 + 1),
                releaseDigest: f.admission.digest,
            }),
        ).rejects.toMatchObject({ code: "REJECTED" });
        expect(await store.getArtifact("contract", "publisher", "publisher/kit", "1.0.0")).toBeNull();
    } finally {
        await f.close();
    }
});

test("upload staging accepts the escaped source and candidate envelope beyond 20 MiB", async () => {
    const f = await sourceFixture();
    const { application: app, owner } = await ownerFixture(join(f.root, "large-upload"));
    try {
        const snapshot = JSON.parse(f.captured.sourceJson);
        for (let index = 0; index < 4; index++) {
            snapshot.files.push({
                path: `translations/en/padded-${index}.json`,
                content: "\n".repeat(1024 * 1024 - 8192),
            });
        }
        const canonicalJson = JSON.stringify({
            ...JSON.parse(f.admission.canonicalJson),
            padding: '"'.repeat(3 * 1024 * 1024),
        });
        const bytes = encodePublicationUpload({
            kind: "collection",
            canonicalJson,
            sourceJson: JSON.stringify(snapshot),
            assets: [],
        });
        expect(bytes.byteLength).toBeGreaterThan(20 * 1024 * 1024);
        expect(parsePublicationUpload(bytes).canonicalJson).toBe(canonicalJson);
        const response = await app.handle(
            jsonRequest("/v1/uploads", owner.token, {
                namespace: "publisher",
                namespaceRevision: 1,
                manifest: new TextDecoder().decode(bytes),
            }),
        );
        expect(response.status).toBe(200);
        // Admission still belongs to the subsequent build; staging makes no release visible.
        expect(await app.index.list("collections")).toHaveLength(0);
    } finally {
        await app.close();
        await f.close();
    }
});
