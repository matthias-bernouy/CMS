import { expect, spyOn, test } from "bun:test";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { CollectionAuthoring } from "@bernouy/cms-repository/repository/authoring";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { authoringFixture, sourceSnapshot } from "./fixture";

test("expired, altered and foreign-instance preparations refuse before remote writes", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const prepared = await f.authoring.prepare(sourceSnapshot());
        const path = join(f.root, "preparations", prepared.preparationId, "prepared.json");
        const saved = await readFile(path, "utf8");
        let writes = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/uploads") || String(input).endsWith("/v1/source-snapshots/put")) {
                writes++;
            }
            return original(input, init);
        }, original);
        await expect(f.authoring.publish("../escape", prepared.digest)).rejects.toThrow("invalid");
        await expect(f.authoring.publish(prepared.preparationId, `sha256:${"0".repeat(64)}`)).rejects.toThrow(
            "invalid",
        );
        await writeFile(path, JSON.stringify({ ...JSON.parse(saved), sourceJson: "altered" }));
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow("changed");
        await writeFile(path, JSON.stringify({ ...JSON.parse(saved), expiresAt: 0 }));
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow("expired");
        await writeFile(path, saved);
        const markup = join(
            f.root,
            "preparations",
            prepared.preparationId,
            "sample",
            "blocs/community--sample--panel/markup.html",
        );
        const originalMarkup = await readFile(markup, "utf8");
        await writeFile(markup, "<invalid>");
        await expect(f.authoring.publish(prepared.preparationId, prepared.digest)).rejects.toThrow("sources changed");
        await writeFile(markup, originalMarkup);
        const other = new CollectionAuthoring(
            { root: join(f.root, "another-instance"), contracts: f.contracts, readAsset: async () => new Blob() },
            f.publisher,
        );
        await expect(other.publish(prepared.preparationId, prepared.digest)).rejects.toThrow("invalid");
        expect(writes).toBe(0);
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("preflight limits one lineage to 64 metadata reads and never hydrates other collections or assets", async () => {
    const f = await authoringFixture();
    try {
        const stable = await f.authoring.prepare(sourceSnapshot());
        await f.authoring.publish(stable.preparationId, stable.digest);
        const { canonicalJson } = await new RemoteRepositoryClient(f.base).pull({
            kind: "collection",
            publisherId: "community",
            id: "community/sample",
            version: "1.0.0",
        });
        const release = JSON.parse(canonicalJson);
        const directory = join(f.root, "registry", "releases", "community", "sample");
        for (let index = 1; index <= 65; index++) {
            await writeFile(
                join(directory, `1.0.${index}.json`),
                canonicalizeIJson({ ...release, version: `1.0.${index}` }),
            );
        }
        await mkdir(join(f.root, "registry", "releases", "unrelated", "broken"), { recursive: true });
        await writeFile(join(f.root, "registry", "releases", "unrelated", "broken", "1.0.0.json"), "Must not be read");
        const metadata = spyOn(LocalCollectionRepository.prototype, "getMetadata");
        const assets = spyOn(LocalCollectionRepository.prototype, "get");
        try {
            const next = await f.authoring.prepare(sourceSnapshot("1.1.0"));
            expect(next.preflight).toBe("incomplete");
            expect(metadata.mock.calls).toHaveLength(65); // One exact-coordinate read plus at most 64 history entries.
            expect(metadata.mock.calls.every((call) => call[0] === "community" && call[1] === "community/sample")).toBe(
                true,
            );
            expect(assets).not.toHaveBeenCalled();
        } finally {
            metadata.mockRestore();
            assets.mockRestore();
        }
    } finally {
        await f.close();
    }
});

test("authoritative preflight checks account ownership and candidate namespace before inspecting history", async () => {
    const f = await authoringFixture();
    try {
        const prepared = await f.authoring.prepare(sourceSnapshot());
        const value = JSON.parse(
            await readFile(join(f.root, "preparations", prepared.preparationId, "prepared.json"), "utf8"),
        );
        const input = { namespace: "community", namespaceRevision: 1, canonicalJson: value.canonicalJson };
        await expect(f.application.service.publications.checkCollection(input, undefined)).rejects.toThrow(
            "authenticated",
        );
        const other = await f.application.account("other-account");
        await expect(f.application.service.publications.checkCollection(input, other.accountId)).rejects.toThrow();
        const changed = JSON.parse(value.canonicalJson.replaceAll("community--sample--", "foreign--sample--"));
        changed.publisherId = "foreign";
        changed.collectionId = "foreign/sample";
        await expect(
            f.application.service.publications.checkCollection(
                { ...input, canonicalJson: canonicalizeIJson(changed) },
                f.account.accountId,
            ),
        ).rejects.toThrow("outside the owned namespace");
        expect(await f.authoring.sources("community", "community/sample", "1.0.0")).toBeNull();
        expect((await f.application.namespaces.get("community"))?.revision).toBe(1);
    } finally {
        await f.close();
    }
});
