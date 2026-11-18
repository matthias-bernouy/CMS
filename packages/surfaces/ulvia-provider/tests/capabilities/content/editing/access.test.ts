import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    createCmsSiteBloc,
    readCmsSiteBloc,
} from "@bernouy/content";
import { contentTransport } from "../transport";

test("all new operations refuse anonymous, non-admin, foreign-instance and injected-scope calls", async () => {
    const repo = new ValidatingContentRepository(new InMemoryContentRepository());
    await createCmsSiteBloc(repo, { tag: "site-private", name: "Private", group: "Site", content: "<p>Draft</p>" });
    const read = await readCmsSiteBloc(repo, { tag: "site-private" });
    const before = await repo.getBlocRecord(read.tag);
    const { call } = await contentTransport({ repo });
    const operations = [
        ["site-blocs.read", { tag: read.tag }],
        ["site-blocs.identity", { tag: read.tag }],
        [
            "site-blocs.update",
            { tag: read.tag, definitionId: read.definitionId, revision: 1, draftJson: read.draftJson },
        ],
        ["site-blocs.delete", { tag: read.tag, definitionId: read.definitionId, revision: 1 }],
        ["site.favicon.get", {}],
        ["site.favicon.update", { expectedRevision: 0, favicon: "/icon.svg" }],
    ] as const;
    for (const [capability, input] of operations) {
        expect((await call(capability, input, { authenticated: false })).status).toBe(401);
        for (const actorKind of ["anonymous", "user"] as const) {
            expect((await call(capability, input, { claims: { actorKind } })).status).toBe(403);
        }
        expect((await call(capability, input, { claims: { instanceId: "other-instance" } })).status).toBe(401);
        if (capability !== "site.favicon.get") {
            expect((await call(capability, { ...input, siteId: "other-site" })).status).toBe(400);
        }
    }
    expect(await repo.getBlocRecord(read.tag)).toEqual(before);
    expect(await repo.getSystemRevision()).toBe(0);
});

test("invalid writes preserve state and separate instance repositories never share drafts or favicons", async () => {
    const first = new ValidatingContentRepository(new InMemoryContentRepository());
    const second = new ValidatingContentRepository(new InMemoryContentRepository());
    await createCmsSiteBloc(first, { tag: "site-private", name: "Private", group: "Site", content: "<p>Draft</p>" });
    const a = await contentTransport({ repo: first });
    const b = await contentTransport({ repo: second });
    const before = await first.getBlocRecord("site-private");
    const current = await readCmsSiteBloc(first, { tag: "site-private" });
    expect(
        (
            await a.call("site-blocs.update", {
                tag: current.tag,
                definitionId: "obsolete-identity",
                revision: 1,
                draftJson: current.draftJson,
            })
        ).status,
    ).toBe(409);
    expect(
        (await a.call("site-blocs.delete", { tag: current.tag, definitionId: "obsolete-identity", revision: 1 }))
            .status,
    ).toBe(409);
    expect(
        (
            await a.call("site-blocs.update", {
                tag: "site-private",
                definitionId: before!.siteDefinition!.id,
                revision: 1,
                draftJson: "{",
            })
        ).status,
    ).toBe(422);
    expect(
        (
            await a.call("site-blocs.delete", {
                tag: "site-private",
                definitionId: before!.siteDefinition!.id,
                revision: 2,
            })
        ).status,
    ).toBe(409);
    expect((await a.call("site.favicon.update", { expectedRevision: 0, favicon: "javascript:alert(1)" })).status).toBe(
        422,
    );
    expect(await first.getBlocRecord("site-private")).toEqual(before);
    expect(await first.getSystemRevision()).toBe(0);
    expect((await b.call("site-blocs.read", { tag: "site-private" })).status).toBe(404);
    expect(
        (
            await b.call("site-blocs.delete", {
                tag: "site-private",
                definitionId: before!.siteDefinition!.id,
                revision: 1,
            })
        ).status,
    ).toBe(404);
    expect((await a.call("site.favicon.update", { expectedRevision: 0, favicon: "/icon.svg" })).status).toBe(200);
    expect(await (await b.call("site.favicon.get", {})).json()).toEqual({ revision: 0, favicon: "" });
    expect(await second.getSystemRevision()).toBe(0);
});
