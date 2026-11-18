import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { expect, test } from "bun:test";
import type { InMemoryContentRepository } from "@bernouy/content";
import { ADMIN } from "../site-pages/site-pages.fixture";
import { editingFixture } from "./fixture";

test("MCP discovery exposes complete composition editing and favicon workflows", async () => {
    const f = await editingFixture();
    const { tools } = await f.binding.list(ADMIN);
    for (const name of [
        "site-blocs.read",
        "site-blocs.identity",
        "site-blocs.update",
        "site-blocs.delete",
        "site.favicon.get",
        "site.favicon.update",
    ]) {
        const tool = tools.find(
            (candidate) =>
                candidate.name ===
                capabilityToolName("ulvia/cms.content", name, "mcp", `content_${name.replaceAll(/[.-]/g, "_")}`),
        );
        expect(tool).toBeDefined();
        expect(JSON.stringify(tool!._meta)).toMatch(/site\/(compositions|favicon)\.md/);
    }
});

test("identity can be read and used for deletion when legacy source exceeds the response byte limit", async () => {
    const f = await editingFixture();
    const created = await f.call("site-blocs.create", {
        tag: "site-legacy",
        name: "Legacy",
        group: "Site",
        content: "<p>Legacy</p>",
    });
    expect(created.isError).toBeUndefined();
    const record = (await f.repository.getBlocRecord("site-legacy"))!;
    // Model an existing stored source without applying today's authoring bounds.
    const stored = Reflect.get(f.repository, "inner") as InMemoryContentRepository;
    await stored.saveSiteBlocDraft(
        "site-legacy",
        { ...record.siteDefinition!.draft, structure: [{ kind: "text", value: "x".repeat(4 * 1024 * 1024) }] },
        1,
    );
    const identity = await f.call("site-blocs.identity", { tag: "site-legacy" });
    expect(identity.isError).toBeUndefined();
    const output = (
        identity.structuredContent as { output: { tag: string; definitionId: string; draftRevision: number } }
    ).output;
    expect(output).not.toHaveProperty("draftJson");
    expect((await f.call("site-blocs.read", { tag: output.tag })).isError).toBe(true);
    expect(
        (
            await f.call("site-blocs.delete", {
                tag: output.tag,
                definitionId: output.definitionId,
                revision: output.draftRevision,
            })
        ).isError,
    ).toBeUndefined();
    expect(await f.repository.getBlocRecord(output.tag)).toBeNull();
});

test("HTTP and MCP edit drafts, publish explicitly and return structured deletion blockers", async () => {
    const f = await editingFixture();
    const tag = "site-shared-navigation";
    const created = await f.call("site-blocs.create", {
        tag,
        name: "Navigation",
        group: "Site",
        content: "<nav><a href='/'>Before</a></nav>",
    });
    expect(created.isError).toBeUndefined();
    const read = await f.call("site-blocs.read", { tag });
    const output = (
        read.structuredContent as { output: { draftJson: string; definitionId: string; publishedJson: null } }
    ).output;
    expect(output.publishedJson).toBeNull();
    const draft = JSON.parse(output.draftJson);
    draft.structure[0].children[0].children[0].value = "After";
    const saved = await f.request("/site-blocs/update", {
        tag,
        definitionId: output.definitionId,
        revision: 1,
        draftJson: JSON.stringify(draft),
    });
    expect(saved.status).toBe(200);
    expect(await saved.json()).toMatchObject({ draftRevision: 2, publishedRevision: null });
    expect((await f.repository.getBlocRecord(tag))?.artifact).toBeNull();
    expect((await f.call("site-blocs.publish", { tag, revision: 2 })).isError).toBeUndefined();
    expect((await f.repository.getBlocRecord(tag))?.artifact?.markupHTML).toContain("After");
    const metadata = await f.call("site-blocs.get", { tag });
    expect((metadata.structuredContent as { output: object }).output).not.toHaveProperty("draftJson");
    await f.repository.insertPage("/consumer", "Consumer", `<div cms-bloc="${tag}"></div>`);
    const page = (await f.repository.getPage("/consumer"))!;
    const before = await f.repository.getBlocRecord(tag);
    const blocked = await f.request("/site-blocs/delete", { tag, revision: 2, definitionId: output.definitionId });
    expect(blocked.status).toBe(409);
    expect(await blocked.json()).toMatchObject({
        error: {
            code: "BLOC_REFERENCED",
            output: {
                references: [{ kind: "page", id: page.id }],
                truncated: false,
            },
        },
    });
    const mcpBlocked = await f.call("site-blocs.delete", { tag, revision: 2, definitionId: output.definitionId });
    expect(mcpBlocked.isError).toBe(true);
    expect(mcpBlocked.structuredContent).toMatchObject({
        error: {
            code: "BLOC_REFERENCED",
            output: {
                references: [{ kind: "page", id: page.id }],
            },
        },
    });
    expect(await f.repository.getBlocRecord(tag)).toEqual(before);
    await f.repository.deletePage(page.id, page.revision);
    const removed = await f.request("/site-blocs/delete", { tag, revision: 2, definitionId: output.definitionId });
    expect(removed.status).toBe(200);
    expect(await removed.json()).toEqual({ tag, deleted: true });
    expect((await f.request("/site-blocs/read", { tag }, "QUERY")).status).toBe(404);
});
