import { expect, test } from "bun:test";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { CollectionPreparationError } from "@bernouy/cms-repository/repository/authoring";
import { RemoteRepositoryClient } from "@bernouy/cms-repository/repository/publication";
import { authoringFixture, configurationSource, sourceSnapshot } from "./fixture";

test("preparation checks authoritative evolution and cleans refused candidates without opening uploads", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const paths: string[] = [];
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            paths.push(new URL(input instanceof Request ? input.url : String(input)).pathname);
            return original(input, init);
        }, original);
        const stable = await f.authoring.prepare(sourceSnapshot());
        expect(paths).toHaveLength(4);
        expect(paths.filter((path) => path.endsWith("/v1/publications/check-collection"))).toHaveLength(1);
        globalThis.fetch = original;
        expect(stable.preflight).toBe("complete");
        await f.authoring.publish(stable.preparationId, stable.digest);
        const before = await readdir(join(f.root, "preparations"));
        let uploads = 0;
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).includes("/v1/uploads")) {
                uploads++;
            }
            return original(input, init);
        }, original);
        try {
            await f.authoring.prepare(configurationSource("1.0.1"));
            throw new Error("Expected patch refusal");
        } catch (error) {
            expect(error).toBeInstanceOf(CollectionPreparationError);
            expect((error as CollectionPreparationError).diagnostics?.[0]?.code).toBe(
                "collection.publication.minor_required",
            );
            expect((error as Error).message).toContain("minor version");
        }
        expect(uploads).toBe(0);
        expect(await readdir(join(f.root, "preparations"))).toEqual(before);
        expect((await f.authoring.prepare(configurationSource("1.1.0"))).preflight).toBe("complete");
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("preflight includes yanked stable releases and publication rechecks a racing release", async () => {
    const f = await authoringFixture();
    try {
        const stable = await f.authoring.prepare(sourceSnapshot());
        await f.authoring.publish(stable.preparationId, stable.digest);
        await new RemoteRepositoryClient(f.base, f.credential).yank(
            { kind: "collection", publisherId: "community", id: "community/sample", version: "1.0.0" },
            "Hidden from discovery",
        );
        await expect(f.authoring.prepare(configurationSource("1.0.1"))).rejects.toThrow("minor version");
        const left = await f.authoring.prepare(configurationSource("1.1.0", "Left"));
        const right = await f.authoring.prepare(configurationSource("1.1.0", "Right"));
        await f.authoring.publish(right.preparationId, right.digest);
        try {
            await f.authoring.publish(left.preparationId, left.digest);
            throw new Error("Expected immutable release refusal");
        } catch (error) {
            expect(error).toMatchObject({ code: "REJECTED", publicationCode: "immutable_conflict" });
        }
        expect((await f.authoring.sources("community", "community/sample", "1.1.0"))?.releaseDigest).toBe(right.digest);
    } finally {
        await f.close();
    }
});

test("unavailable preflight is explicit and does not bypass final publication validation", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        const stable = await f.authoring.prepare(sourceSnapshot());
        await f.authoring.publish(stable.preparationId, stable.digest);
        globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
            if (String(input).endsWith("/v1/publications/check-collection")) {
                return new Response(null, { status: 503 });
            }
            return original(input, init);
        }, original);
        const patch = await f.authoring.prepare(configurationSource("1.0.1"));
        expect(patch.preflight).toBe("incomplete");
        expect(patch.diagnostics).toContainEqual(
            expect.objectContaining({ code: "collection.preflight_incomplete", severity: "warning" }),
        );
        await expect(f.authoring.publish(patch.preparationId, patch.digest)).rejects.toMatchObject({
            code: "REJECTED",
            publicationCode: "minor_required",
        });
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});

test("Repository identity outage during namespace lookup reports incomplete preflight", async () => {
    const f = await authoringFixture();
    const original = globalThis.fetch;
    try {
        globalThis.fetch = Object.assign(
            async (input: RequestInfo | URL, init?: RequestInit) =>
                String(input).endsWith("/v1/info") ? new Response(null, { status: 503 }) : original(input, init),
            original,
        );
        const prepared = await f.authoring.prepare(sourceSnapshot());
        expect(prepared.preflight).toBe("incomplete");
        expect(prepared.diagnostics[0]?.code).toBe("collection.preflight_incomplete");
    } finally {
        globalThis.fetch = original;
        await f.close();
    }
});
