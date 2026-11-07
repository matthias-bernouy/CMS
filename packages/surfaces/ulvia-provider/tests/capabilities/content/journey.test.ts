import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";
import { decodeResourceMetadata, RESOURCE_HEADER } from "@bernouy/cms-gateway/protocol";
import { contentTransport } from "./transport";

test("signed Content HTTP refuses unauthorized, foreign-instance and invalid writes before repository mutations", async () => {
    const inner = new InMemoryContentRepository();
    const repo = new ValidatingContentRepository(inner);
    let writes = 0;
    const insert = repo.insertPage.bind(repo);
    repo.insertPage = async (...args) => {
        writes++;
        return insert(...args);
    };
    const { call } = await contentTransport({ repo });
    const input = { path: "/draft", title: "Draft" };
    expect((await call("pages.create", input, { authenticated: false })).status).toBe(401);
    for (const actorKind of ["anonymous", "user"] as const) {
        expect((await call("pages.create", input, { claims: { actorKind } })).status).toBe(403);
    }
    expect((await call("pages.create", input, { claims: { instanceId: "foreign" } })).status).toBe(401);
    expect((await call("pages.create", { ...input, actorKind: "administrator" })).status).toBe(400);
    const invalid = await call("pages.create", { ...input, title: "   " });
    expect(invalid.status).toBe(422);
    expect((await invalid.json()).error.code).toBe("INVALID_PAGE");
    expect(writes).toBe(0);
    expect(await inner.getAllPages()).toEqual([]);
    const created = await call("pages.create", input);
    expect(created.status).toBe(201);
    const page = await created.json();
    expect(writes).toBe(1);
    expect(
        (await call("pages.update", { id: page.id, expectedRevision: page.revision + 1, title: "Stale" })).status,
    ).toBe(409);
    expect(await inner.getPageById(page.id)).toMatchObject({ title: "Draft", revision: page.revision });
});

test("signed Content page listings make one bounded metadata query and refuse invalid limits before reading", async () => {
    const repo = new InMemoryContentRepository();
    for (let index = 0; index < 3; index++) {
        await repo.insertPage(`/page-${index}`, `Page ${index}`);
    }
    const counts = { queries: 0, loaded: 0, limits: [] as number[] };
    const list = repo.getPagesMetadata.bind(repo);
    repo.getPagesMetadata = async (query) => {
        counts.queries++;
        counts.limits.push(query!.limit!);
        const rows = await list(query);
        counts.loaded += rows.length;
        return rows;
    };
    repo.getAllPages = async () => {
        throw new Error("Unexpected full-page scan");
    };
    const { call } = await contentTransport({ repo });
    expect((await call("pages.list", { limit: 101 })).status).toBe(400);
    expect(counts.queries).toBe(0);
    const first = await call("pages.list", { limit: 2 });
    expect(first.status).toBe(200);
    const page = await first.json();
    expect(page.items).toHaveLength(2);
    expect(page.nextCursor).toBeString();
    const second = await call("pages.list", { limit: 2, cursor: page.nextCursor });
    expect(second.status).toBe(200);
    expect((await second.json()).items).toHaveLength(1);
    expect(counts).toEqual({ queries: 2, loaded: 4, limits: [3, 3] });
});

test("signed Content resources carry safe representation metadata and reject invented actors before rendering", async () => {
    const counts = { factories: 0, resolves: 0 };
    const { call } = await contentTransport({
        publicDelivery: (context) => {
            counts.factories++;
            expect(context.actorKind).toBe("anonymous");
            return {
                resolvePath: async (_input, actor, _query, metadata) => {
                    counts.resolves++;
                    expect(actor).toEqual({ kind: "anonymous" });
                    expect(new Headers(metadata?.headers).get("accept-language")).toBe("fr");
                    return new Response("page", {
                        status: 404,
                        headers: {
                            "content-type": "text/html",
                            etag: '"v1"',
                            "set-cookie": "private=value",
                            "content-security-policy": "unsafe",
                        },
                    });
                },
            };
        },
    });
    const input = { path: "/missing", method: "GET", query: [] };
    const missing = await call("delivery.resolve-resource", input, {
        claims: { actorKind: undefined, subjectId: undefined },
    });
    expect(missing.status).toBe(403);
    expect((await call("delivery.resolve-resource", { ...input, actorKind: "administrator" })).status).toBe(400);
    expect(counts).toEqual({ factories: 0, resolves: 0 });
    const response = await call("delivery.resolve-resource", input, {
        claims: { actorKind: "anonymous", subjectId: undefined },
        headers: { "accept-language": "fr" },
    });
    expect(response.status).toBe(200);
    expect(await response.text()).toBe("page");
    expect(decodeResourceMetadata(response.headers.get(RESOURCE_HEADER))).toEqual({
        status: 404,
        headers: { "content-type": "text/html", etag: '"v1"' },
        vary: ["accept", "accept-language"],
        cacheTags: ["content:pages"],
    });
    expect(response.headers.get("set-cookie")).toBeNull();
    expect(response.headers.get("content-security-policy")).toBeNull();
    expect(counts).toEqual({ factories: 1, resolves: 1 });
});
