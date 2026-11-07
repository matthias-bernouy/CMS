import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { expect, test } from "bun:test";
import { sitePagesFixture, ADMIN, PAGE_FIELDS } from "./site-pages.fixture";

test("MCP discovery exposes nullable system Page references on both site tools", async () => {
    const f = await sitePagesFixture();
    const { tools } = await f.binding.list(ADMIN);
    const update = tools.find(
        (tool) => tool.name === capabilityToolName("ulvia/cms.content", "site.update", "mcp", "content_site_update"),
    )!;
    const get = tools.find(
        (tool) => tool.name === capabilityToolName("ulvia/cms.content", "site.get", "mcp", "content_site_get"),
    )!;
    const input = (update.inputSchema.properties as Record<string, unknown>).input as {
        properties: Record<string, unknown>;
    };
    for (const field of PAGE_FIELDS) {
        expect(input.properties[field]).toMatchObject({
            anyOf: [
                { properties: { pageId: { maxLength: 200 } }, required: ["pageId"], additionalProperties: false },
                { type: "null" },
            ],
        });
        expect(JSON.stringify(get.outputSchema)).toContain(`"${field}"`);
    }
});

test("HTTP and MCP share system Page selections and optimistic revisions", async () => {
    const f = await sitePagesFixture();
    const request = (body: unknown) =>
        new Request("https://site.test/.cms/call/ulvia/cms.content/site", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify(body),
        });
    const response = await f.http(request({ expectedRevision: 0, ...f.references }));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ revision: 1, ...f.references });
    expect((await f.call("get")).structuredContent).toMatchObject({ output: { revision: 1, ...f.references } });
    const conflict = await f.http(request({ expectedRevision: 0, notFound: null }));
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toMatchObject({ error: { code: "REVISION_CONFLICT" } });
    const malformed = await f.http(
        request({ expectedRevision: 1, login: { pageId: f.references.login!.pageId, siteId: "other" } }),
    );
    expect(malformed.status).toBe(400);
    expect(await f.repository.getSystemRevision()).toBe(1);
    expect((await f.repository.getSystem()).site.login).toEqual(f.references.login!);
    expect((await f.call("update", { expectedRevision: 1, login: null })).isError).toBeUndefined();
    const read = await f.http(new Request("https://site.test/.cms/call/ulvia/cms.content/site"));
    expect(read.status).toBe(200);
    expect(await read.json()).toMatchObject({ revision: 2, login: null, notFound: f.references.notFound });
});
