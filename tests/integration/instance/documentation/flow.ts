import { expect } from "bun:test";
import type { connectBrowser } from "../oauth";

export async function exerciseDocumentation(connection: Awaited<ReturnType<typeof connectBrowser>>, cmsUrl: string) {
    const tool = connection.tools.find((entry) => entry._meta["io.ulvia/capability"] === "pages.create")!;
    const links = tool._meta["io.ulvia/docs"] as {
        reference: { contractId: string; releaseDigest: string; path: string };
        title: string;
    }[];
    expect(links).toHaveLength(4);
    const reference = links.find((entry) => entry.reference.path.endsWith("create-and-publish.md"))!.reference;
    const search = await connection.call("ulvia/cms.installations", "documentation.search", {
        query: "Comment créer et vérifier une page avant publication ?",
        contractId: "ulvia/cms.content",
        capabilityId: "pages.create",
    });
    expect(["hybrid", "lexical"]).toContain(search.mode);
    expect(search.degraded).toBe(search.mode === "lexical");
    expect(search.results.length).toBeGreaterThan(0);
    expect(
        search.results.every(
            (item: { reference: { releaseDigest: string } }) =>
                item.reference.releaseDigest === reference.releaseDigest,
        ),
    ).toBe(true);
    const document = await connection.call("ulvia/cms.installations", "documentation.get", { reference });
    expect(document.content).toContain("## Verify and improve");
    expect(document.content).toContain("pages.get");
    expect(document.nextOffset).toBeNull();
    const resources = await connection.rpc("resources/read", { uri: "ulvia://cms/site-files" });
    expect(resources.contents[0].text).toContain("upload");
    const getTool = connection.tools.find((entry) => entry._meta["io.ulvia/capability"] === "documentation.get")!;
    const stale = await connection.rpc("tools/call", {
        name: getTool.name,
        arguments: { input: { reference: { ...reference, releaseDigest: `sha256:${"0".repeat(64)}` } } },
    });
    expect(stale.isError).toBe(true);
    expect(stale.structuredContent.error.code).toBe("REVISION_CONFLICT");
    const forged = await connection.rpc("tools/call", {
        name: getTool.name,
        arguments: { input: { reference, siteId: "another-instance" } },
    });
    expect(forged.isError).toBe(true);
    const created = await connection.call("ulvia/cms.content", "pages.create", {
        path: "/documentation-review",
        title: "Documentation review",
    });
    const updated = await connection.call("ulvia/cms.content", "pages.update", {
        id: created.id,
        expectedRevision: created.revision,
        title: "Verified documentation review",
    });
    const saved = await connection.call("ulvia/cms.content", "pages.get", { id: created.id });
    expect(saved.title).toBe(updated.title);
    expect(saved.visible).toBe(false);
    const updateTool = connection.tools.find((entry) => entry._meta["io.ulvia/capability"] === "pages.update")!;
    const conflict = await connection.rpc("tools/call", {
        name: updateTool.name,
        arguments: { input: { id: created.id, expectedRevision: created.revision, title: "Stale write" } },
    });
    expect(conflict.isError).toBe(true);
    expect(conflict.structuredContent.error.code).toBe("REVISION_CONFLICT");
    expect((await connection.call("ulvia/cms.content", "pages.get", { id: created.id })).title).toBe(updated.title);
    const content = await connection.call("ulvia/cms.content", "pages.update", {
        id: created.id,
        expectedRevision: updated.revision,
        content: '<h1 cms-bloc="ulvia--mossa--heading" size="lg" text-align="start">Documentation flow verified</h1>',
    });
    const published = await connection.call("ulvia/cms.content", "pages.publish", {
        id: created.id,
        expectedRevision: content.revision,
        visible: true,
    });
    expect((await connection.call("ulvia/cms.content", "pages.get", { id: created.id })).visible).toBe(true);
    const publicPage = await connection.browser.newPage();
    try {
        for (const width of [375, 1280]) {
            await publicPage.setViewportSize({ width, height: 900 });
            const response = await publicPage.goto(`${cmsUrl}/documentation-review`);
            expect(response?.status()).toBe(200);
            expect(await publicPage.locator("h1").innerText()).toBe("Documentation flow verified");
            expect(await publicPage.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(
                true,
            );
        }
    } finally {
        await publicPage.close();
    }
    await connection.call("ulvia/cms.content", "pages.publish", {
        id: created.id,
        expectedRevision: published.revision,
        visible: false,
    });
    return { reference, content: document.content, pageId: created.id };
}
