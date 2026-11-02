import { expect } from "bun:test";
import { invoke, refusal } from "../client";
import type { Connection } from "../client";

export async function validationPages(connection: Connection, cmsUrl: string) {
    const { call } = connection;
    const content = '<main cms-bloc="mcp-kit-panel"><p slot="body">Validation source</p></main>';
    const draft = await call("ulvia.cms.content", "pages.create", {
        path: "/validation-source",
        title: "Validation source",
        content,
    });
    expect(draft.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.route_missing", severity: "warning" }),
    );
    const before = await call("ulvia.cms.content", "pages.get", { id: draft.id });
    const denied = await invoke(connection, "ulvia.cms.content", "pages.publish", {
        id: draft.id,
        expectedRevision: draft.revision,
        visible: true,
    });
    refusal(denied, "INVALID_PAGE");
    expect(denied.structuredContent.error.output.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.route_missing", severity: "error" }),
    );
    expect(await call("ulvia.cms.content", "pages.get", { id: draft.id })).toEqual(before);
    expect((await fetch(`${cmsUrl}/validation-source`)).status).toBe(404);
    const target = await call("ulvia.cms.content", "pages.create", {
        path: "/validation-target",
        title: "Validation target",
        content: '<div cms-bloc="mcp-kit-reference"><p slot="body" id="destination">Destination</p></div>',
    });
    const published = await call("ulvia.cms.content", "pages.publish", {
        id: draft.id,
        expectedRevision: draft.revision,
        visible: true,
    });
    expect(published.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.route_draft", severity: "warning" }),
    );
    let targetState = await call("ulvia.cms.content", "pages.publish", {
        id: target.id,
        expectedRevision: target.revision,
        visible: true,
    });
    const stable = await call("ulvia.cms.content", "pages.update", {
        id: published.id,
        expectedRevision: published.revision,
        content,
    });
    expect(stable.diagnostics).toEqual([]);
    const stableState = await call("ulvia.cms.content", "pages.get", { id: stable.id });
    expect(stableState).not.toHaveProperty("diagnostics");
    for (const [invalid, code] of [
        [`${content}${content}`, "page.multiple_main"],
        [
            '<main cms-bloc="mcp-kit-panel"><p slot="body"><a href="#missing">Missing</a></p></main>',
            "page.fragment_missing",
        ],
    ]) {
        const result = await invoke(connection, "ulvia.cms.content", "pages.update", {
            id: stable.id,
            expectedRevision: stable.revision,
            content: invalid,
        });
        refusal(result, "INVALID_PAGE");
        expect(result.structuredContent.error.output.diagnostics).toContainEqual(
            expect.objectContaining({ code, severity: "error" }),
        );
        expect(await call("ulvia.cms.content", "pages.get", { id: stable.id })).toEqual(stableState);
    }
    const broken = await invoke(connection, "ulvia.cms.content", "pages.create", {
        path: "/validation-broken-aria",
        title: "Broken reference",
        content: '<div cms-bloc="mcp-kit-broken-reference"></div>',
    });
    refusal(broken, "INVALID_PAGE");
    expect(broken.structuredContent.error.output.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.reference_missing", severity: "error" }),
    );
    expect((await call("ulvia.cms.content", "pages.list", { query: "Broken reference" })).items).toEqual([]);
    const references = await call("ulvia.cms.content", "pages.create", {
        path: "/validation-references",
        title: "Scoped IDs",
        content: '<div cms-bloc="mcp-kit-reference"></div><div cms-bloc="mcp-kit-reference"></div>',
    });
    expect(references.diagnostics).toEqual([]);
    await call("ulvia.cms.content", "pages.publish", {
        id: references.id,
        expectedRevision: references.revision,
        visible: true,
    });
    const browser = await connection.browser.newPage();
    try {
        for (const width of [375, 1280]) {
            await browser.setViewportSize({ width, height: 900 });
            expect((await browser.goto(`${cmsUrl}/validation-source`))?.status()).toBe(200);
            expect(await browser.locator("main").count()).toBe(1);
            expect(await browser.locator('a[href="/validation-target#destination"]').count()).toBe(1);
        }
        await browser.goto(`${cmsUrl}/validation-references`);
        expect(
            await browser.evaluate(() => {
                const ids = Array.from(document.querySelectorAll("[id]"), (element) => element.id);
                const references = Array.from(document.querySelectorAll("[aria-labelledby]"));
                return (
                    new Set(ids).size === ids.length &&
                    references.length === 2 &&
                    references.every(
                        (element) => document.getElementById(element.getAttribute("aria-labelledby")!) !== null,
                    )
                );
            }),
        ).toBe(true);
    } finally {
        await browser.close();
    }
    refusal(
        await invoke(connection, "ulvia.cms.content", "pages.delete", {
            id: target.id,
            expectedRevision: targetState.revision,
        }),
        "PAGE_REFERENCED",
    );
    expect((await call("ulvia.cms.content", "pages.get", { id: target.id })).revision).toBe(targetState.revision);
    targetState = await call("ulvia.cms.content", "pages.publish", {
        id: target.id,
        expectedRevision: targetState.revision,
        visible: false,
    });
    expect(targetState.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.incoming_unpublished", severity: "warning" }),
    );
    expect((await fetch(`${cmsUrl}/validation-target`)).status).toBe(404);
    await call("ulvia.cms.content", "pages.publish", {
        id: target.id,
        expectedRevision: targetState.revision,
        visible: true,
    });
    return stableState;
}
