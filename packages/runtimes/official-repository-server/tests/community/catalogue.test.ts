import { expect, test } from "bun:test";
import { rm } from "node:fs/promises";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { repositoryWriteHeaders } from "@bernouy/cms-repository/repository/namespaces";
import { createHash } from "node:crypto";
import { communityFixture, simpleContract } from "./fixtures";

test("catalogue cursors use SemVer order and revisioned yanks preserve immutable reads", async () => {
    const f = await communityFixture();
    try {
        const client = new RemoteRepositoryClient(f.base, f.credential);
        for (const version of ["1.0.0", "1.2.0", "1.10.0"]) {
            await client.push({ kind: "contract", canonicalJson: simpleContract("community", version), assets: [] });
        }
        let cursor = "";
        const versions: string[] = [];
        do {
            const url = new URL("v1/contracts", f.base);
            url.searchParams.set("limit", "1");
            if (cursor) {
                url.searchParams.set("cursor", cursor);
            }
            const page = (await (await fetch(url)).json()) as { releases: { version: string }[]; nextCursor?: string };
            versions.push(...page.releases.map((release) => release.version));
            cursor = page.nextCursor ?? "";
        } while (cursor);
        expect(versions).toEqual(["1.0.0", "1.2.0", "1.10.0"]);
        const url = new URL("v1/yanks/contract/community/community.example/1.0.0", f.base);
        const yank = async (reason: string | null, expectedRevision: number) => {
            const body = Buffer.from(JSON.stringify({ reason, expectedRevision }));
            const headers = await repositoryWriteHeaders(
                "PUT",
                url,
                createHash("sha256").update(body).digest("hex"),
                f.credential,
            );
            return fetch(url, { method: "PUT", headers, body });
        };
        expect((await yank("review", 0)).status).toBe(200);
        const first = await (await fetch(url)).json();
        expect(first).toMatchObject({ revision: 1, yank: { reason: "review" } });
        expect((await yank("review", 0)).status).toBe(200);
        expect(await (await fetch(url)).json()).toEqual(first);
        expect((await yank("stale change", 0)).status).toBe(409);
        expect((await fetch(`${f.base}v1/contracts/community/community.example/1.0.0`)).status).toBe(200);
        await client.yank(
            { kind: "contract", publisherId: "community", id: "community.example", version: "1.0.0" },
            null,
        );
        expect(await (await fetch(url)).json()).toEqual({ revision: 2, yank: null });
    } finally {
        f.server.stop(true);
        await rm(f.root, { recursive: true, force: true });
    }
});
