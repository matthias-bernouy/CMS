import { expect, test } from "bun:test";
import { sitePagesFixture, PAGE_FIELDS, ADMIN } from "./site-pages.fixture";

test("MCP configures all system Page roles, preserves omitted settings and clears references", async () => {
    const f = await sitePagesFixture();
    const initial = await f.call("get");
    expect(initial.structuredContent).toMatchObject({
        output: { revision: 0, notFound: null, forbidden: null, serverError: null, login: null },
    });
    const selected = await f.call("update", { expectedRevision: 0, name: "My site", ...f.references });
    expect(selected.isError).toBeUndefined();
    expect(selected.structuredContent).toMatchObject({ output: { revision: 1, name: "My site", ...f.references } });
    expect(f.pageReads).toHaveLength(4);
    const nameOnly = await f.call("update", { expectedRevision: 1, name: "Renamed" });
    expect(nameOnly.structuredContent).toMatchObject({ output: { revision: 2, name: "Renamed", ...f.references } });
    expect(f.pageReads).toHaveLength(4);
    const cleared = await f.call("update", {
        expectedRevision: 2,
        notFound: null,
        forbidden: null,
        serverError: null,
        login: null,
    });
    expect(cleared.structuredContent).toMatchObject({
        output: { revision: 3, name: "Renamed", notFound: null, forbidden: null, serverError: null, login: null },
    });
    expect((await f.call("get")).structuredContent).toEqual(cleared.structuredContent);
    expect(f.pageReads).toHaveLength(4);
    for (const reference of Object.values(f.references)) {
        expect((await f.repository.getPageById(reference.pageId))!.visible).toBe(false);
    }
});

test("system Page selections are atomic on stale revisions and malformed input", async () => {
    const f = await sitePagesFixture();
    await f.call("update", { expectedRevision: 0, notFound: f.references.notFound });
    const snapshot = await f.repository.getSystem();
    const stale = await f.call("update", { expectedRevision: 0, name: "Must not change", notFound: null });
    expect(stale.structuredContent).toMatchObject({ error: { code: "REVISION_CONFLICT" } });
    for (const field of PAGE_FIELDS) {
        for (const reference of [
            "/404",
            {},
            { kind: "collection", pageId: "foreign" },
            { pageId: "bad/id" },
            { pageId: f.references.login!.pageId, siteId: "other" },
        ]) {
            const result = await f.call("update", { expectedRevision: 1, name: "Must not change", [field]: reference });
            expect(result.isError).toBe(true);
            expect(await f.repository.getSystem()).toEqual(snapshot);
            expect(await f.repository.getSystemRevision()).toBe(1);
        }
    }
    expect(await f.repository.getSystem()).toEqual(snapshot);
    expect((await f.call("update", { expectedRevision: 1 })).isError).toBe(true);
});

test("missing and other-instance Pages are refused before any settings change", async () => {
    const f = await sitePagesFixture();
    const neighbour = await sitePagesFixture();
    const snapshot = await f.repository.getSystem();
    const neighbourSnapshot = await neighbour.repository.getSystem();
    for (const reference of [{ pageId: "missing" }, neighbour.references.notFound]) {
        const result = await f.call("update", {
            expectedRevision: 0,
            name: "Must not change",
            notFound: f.references.notFound,
            login: reference,
        });
        expect(result.structuredContent).toMatchObject({ error: { code: "INVALID_INPUT" } });
        expect(await f.repository.getSystem()).toEqual(snapshot);
        expect(await f.repository.getSystemRevision()).toBe(0);
        expect(await neighbour.repository.getSystem()).toEqual(neighbourSnapshot);
    }
});

test("system Page settings retain administrator authorization and instance isolation", async () => {
    const f = await sitePagesFixture();
    const snapshot = await f.repository.getSystem();
    for (const actor of [{ kind: "anonymous" }, { kind: "user", subjectId: "member" }] as const) {
        for (const capability of ["get", "update"] as const) {
            const input = capability === "get" ? {} : { expectedRevision: 0, login: null };
            const result = await f.binding.call(`content_site_${capability}`, { input }, { siteId: "site-a", actor });
            expect(result.isError).toBe(true);
        }
    }
    const otherSite = await f.binding.call(
        "content_site_update",
        { input: { expectedRevision: 0, login: f.references.login } },
        { ...ADMIN, siteId: "site-b" },
    );
    expect(otherSite.isError).toBe(true);
    expect(f.dispatches()).toBe(0);
    expect(await f.repository.getSystem()).toEqual(snapshot);
    expect(await f.repository.getSystemRevision()).toBe(0);
});

test("reference checks are bounded and deduplicate a Page selected for multiple roles", async () => {
    const f = await sitePagesFixture();
    const result = await f.call("update", {
        expectedRevision: 0,
        ...Object.fromEntries(PAGE_FIELDS.map((field) => [field, f.references.notFound])),
    });
    expect(result.isError).toBeUndefined();
    expect(f.pageReads).toEqual([f.references.notFound!.pageId]);
    expect(f.dispatches()).toBe(1);
});

test("the API rejects the retired discriminator without changing settings", async () => {
    const f = await sitePagesFixture();
    const legacy = { kind: "site", pageId: f.references.login!.pageId };
    const invalid = await f.call("update", { expectedRevision: 0, login: legacy });
    expect(invalid.isError).toBe(true);
    expect(await f.repository.getSystemRevision()).toBe(0);
    expect((await f.repository.getSystem()).site.login).toBeNull();
    const updated = await f.call("update", { expectedRevision: 0, login: { pageId: legacy.pageId } });
    expect(updated.isError).toBeUndefined();
    expect((await f.repository.getSystem()).site.login).toEqual({ pageId: legacy.pageId });
});
