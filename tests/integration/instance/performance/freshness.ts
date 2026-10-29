import { expect } from "bun:test";
import type { connectBrowser } from "../oauth";

/** Real commands cross MCP/Gateway; anonymous cache entries must immediately observe completed writes. */
export async function exerciseFreshness(connection: Awaited<ReturnType<typeof connectBrowser>>, cmsUrl: string) {
    const call = (capability: string, input: Record<string, unknown> = {}) =>
        connection.call("ulvia.cms.content", capability, input);
    let path = "/cache-freshness";
    const read = async (cache?: string) => {
        const response = await fetch(`${cmsUrl}${path}`, { redirect: "manual" });
        if (cache) {
            expect(response.headers.get("x-cache")).toBe(cache);
        }
        return { status: response.status, text: await response.text() };
    };
    const warm = async () => {
        expect((await read("MISS")).status).toBe(200);
        expect((await read("HIT")).status).toBe(200);
    };
    let page = await call("pages.create", {
        path,
        title: "Freshness",
        content: '<h1 cms-bloc="ulvia-official-heading" size="lg" text-align="start">Initial cache version</h1>',
    });
    page = await call("pages.publish", { id: page.id, expectedRevision: page.revision, visible: true });
    await warm();
    page = await call("pages.update", {
        id: page.id,
        expectedRevision: page.revision,
        content: '<h1 cms-bloc="ulvia-official-heading" size="lg" text-align="start">Changed cache version</h1>',
    });
    expect((await read("MISS")).text).toContain("Changed cache version");
    await read("HIT");
    // Invalid input fails before dispatch; a declared revision error is dispatched and purges.
    await expect(call("pages.update", {})).rejects.toThrow();
    await read("HIT");
    await expect(call("pages.update", { id: page.id, expectedRevision: 1, title: "Rejected" })).rejects.toThrow();
    await warm();
    const languages = await call("localization.get");
    page = await call("pages.update-seo", {
        id: page.id,
        expectedRevision: page.revision,
        language: languages.language,
        title: "Fresh SEO",
    });
    expect((await read("MISS")).text).toContain("Fresh SEO");
    await read("HIT");
    page = await call("pages.update-route", {
        id: page.id,
        expectedRevision: page.revision,
        language: languages.language,
        path: "/cache-freshness-moved",
    });
    expect((await read()).status).toBeGreaterThanOrEqual(300);
    path = "/cache-freshness-moved";
    await warm();
    const site = await call("site.get");
    const hidden = await call("site.update", { expectedRevision: site.revision, visible: false });
    expect((await read()).status).not.toBe(200);
    await call("site.update", { expectedRevision: hidden.revision, visible: true });
    await warm();
    const theme = await call("theme.get", { collectionId: "ulvia-official" });
    await call("theme.activate", { expectedRevision: theme.revision, themeId: theme.activeThemeId });
    await warm();
    const localization = await call("localization.get");
    await call("localization.update", {
        expectedRevision: localization.revision,
        language: localization.language,
        additionalLanguages: [...new Set([...localization.additionalLanguages, "de"])],
        activeLanguages: localization.activeLanguages,
    });
    await warm();
    page = await call("pages.get", { id: page.id });
    await call("pages.publish", { id: page.id, expectedRevision: page.revision, visible: false });
    expect((await read()).status).toBe(404);
    expect((await read()).status).toBe(404);
    return { completedWritesImmediate: true, invalidInputPreservesCache: true, declaredErrorsPurge: true };
}
