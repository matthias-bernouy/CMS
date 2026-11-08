import { expect, test } from "bun:test";
import {
    InMemoryContentRepository,
    ValidatingContentRepository,
    analyzePageLinks,
    analyzePageLinkReport,
} from "@bernouy/content";

import { analyzeExpandedPageDocument } from "@bernouy/content/page-document";

async function fixture(markup = "<main><slot></slot></main>") {
    const inner = new InMemoryContentRepository();
    await inner.createBloc({
        id: "example--test--shell",
        name: "Shell",
        group: "Test",
        description: "Test",
        viewJS: "",
        markupHTML: markup,
        kind: "component",
        root: { accepts: ["div"] },
        slots: { "": { accepts: [{ kind: "native-content", profile: "prose" }] } },
        ownership: { kind: "code-managed" },
    });
    return { inner, repo: new ValidatingContentRepository(inner) };
}

test("Page link analysis loads at most 32 unique target documents and reports the remainder", async () => {
    const { inner, repo } = await fixture();
    for (let i = 0; i < 40; i++) {
        await inner.insertPage(`/target-${i}`, "Target");
        const page = (await inner.getPage(`/target-${i}`))!;
        await inner.updatePage({ id: page.id, visible: true }, page.revision);
    }
    let batches = 0;
    const original = inner.getPagesByIds.bind(inner);
    inner.getPagesByIds = async (ids) => {
        batches++;
        expect(ids).toHaveLength(32);
        return original(ids);
    };
    const content = `<div cms-bloc="example--test--shell">${Array.from({ length: 40 }, (_, i) => `<a href="/target-${i}">Link</a>`).join("")}</div>`;
    const feedback = await repo.insertPage("/source", "Source", content);
    expect(batches).toBe(1);
    expect(feedback?.diagnostics.filter((item) => item.code === "page.link_analysis_incomplete")).toHaveLength(8);
});

test("analysis is instance scoped even when another instance has a matching target route", async () => {
    const source = await fixture('<main><a href="/target">Target</a></main>');
    const neighbour = await fixture();
    await neighbour.repo.insertPage("/target", "Private neighbour Page");
    await source.repo.insertPage("/source", "Source", '<div cms-bloc="example--test--shell"></div>');
    const page = (await source.repo.getPage("/source"))!;
    await expect(source.repo.updatePage({ id: page.id, visible: true }, page.revision)).rejects.toThrow(
        "unavailable route",
    );
    expect((await source.repo.getPage("/source"))?.revision).toBe(page.revision);
});

test("a self alias checks fragment IDs against the candidate document rather than stored content", async () => {
    const { repo } = await fixture();
    await repo.updateSystem({ site: { language: "en" } } as never);
    await repo.insertPage("/old", "Source", '<div cms-bloc="example--test--shell"><p id="old">Old</p></div>');
    let page = (await repo.getPage("/old"))!;
    page = await repo.setPagePaths(page.id, { en: "/new" }, undefined, undefined, page.revision);
    const content = '<div cms-bloc="example--test--shell"><a href="/old#new">New</a><p id="new">New</p></div>';
    const saved = await repo.updatePage({ id: page.id, visible: true, content }, page.revision);
    expect(saved?.diagnostics).toEqual([]);
    await expect(
        repo.updatePage({ id: page.id, content: content.replace("/old#new", "/old#old") }, saved!.revision),
    ).rejects.toThrow("has no target");
    expect((await repo.getPageById(page.id))?.revision).toBe(saved?.revision);
});

test("unpublishing a linked Page succeeds with an incoming-link advisory", async () => {
    const { inner, repo } = await fixture();
    await inner.insertPage("/target", "Target");
    let target = (await inner.getPage("/target"))!;
    target = (await inner.updatePage({ id: target.id, visible: true }, target.revision))!;
    await repo.insertPage(
        "/source",
        "Source",
        '<div cms-bloc="example--test--shell"><a href="/target">Target</a></div>',
    );
    const hidden = await repo.updatePage({ id: target.id, visible: false }, target.revision);
    expect(hidden?.visible).toBe(false);
    expect(hidden?.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.incoming_unpublished", severity: "warning" }),
    );
});

test("an inactive translation of the current Page is unavailable rather than over the target budget", async () => {
    const { inner, repo } = await fixture();
    await repo.updateSystem({ site: { language: "en", additionalLanguages: ["fr"], activeLanguages: [] } } as never);
    await repo.insertPage("/source", "Source");
    let page = (await repo.getPage("/source"))!;
    page = await repo.setPagePaths(page.id, { en: "/source", fr: "/cible" }, undefined, undefined, page.revision);
    const before = await inner.getPageById(page.id);
    await expect(
        repo.updatePage(
            {
                id: page.id,
                visible: true,
                content: '<div cms-bloc="example--test--shell"><a href="/fr/cible">Translation</a></div>',
            },
            page.revision,
        ),
    ).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: "page.route_missing", severity: "error" })],
    });
    expect(await inner.getPageById(page.id)).toEqual(before);
});

test("replacing a Bloc refuses new HTML errors in indirect Page consumers before persistence", async () => {
    const { inner, repo } = await fixture('<main><div cms-bloc="example--test--child"></div></main>');
    const child = await inner.createBloc({
        id: "example--test--child",
        name: "Child",
        group: "Test",
        description: "Test",
        viewJS: "",
        markupHTML: "<p>Child</p>",
        kind: "component",
        root: { accepts: ["div"] },
        ownership: { kind: "code-managed" },
    });
    await inner.insertPage("/source", "Source", '<div cms-bloc="example--test--shell"></div>');
    await expect(repo.replaceBloc({ ...child, markupHTML: "<main>Nested</main>" })).rejects.toThrow("nested inside");
    expect((await inner.getBlocRecord(child.id))?.artifact?.markupHTML).toBe("<p>Child</p>");
});

test.each(["warnings", "error", "budget"] as const)(
    "link report preserves verification state when %s diagnostics are truncated",
    async (scenario) => {
        const { inner } = await fixture();
        let html = '<a href="/missing">Missing</a>'.repeat(40);
        if (scenario === "error") {
            html += '<a href="/#%ZZ">Invalid fragment</a>';
        }
        if (scenario === "budget") {
            for (let i = 0; i < 40; i++) {
                await inner.insertPage(`/target-${i}`, "Target");
                const page = (await inner.getPage(`/target-${i}`))!;
                await inner.updatePage({ id: page.id, visible: true }, page.revision);
                html += `<a href="/target-${i}">Target</a>`;
            }
        }
        let routeBatches = 0;
        let pageBatches = 0;
        const routes = inner.getPageRoutes.bind(inner);
        const pages = inner.getPagesByIds.bind(inner);
        inner.getPageRoutes = async (paths) => {
            routeBatches++;
            return routes(paths);
        };
        inner.getPagesByIds = async (ids) => {
            pageBatches++;
            expect(ids.length).toBeLessThanOrEqual(32);
            return pages(ids);
        };
        const analysis = analyzeExpandedPageDocument(html, []);
        const page = { path: "/source", visible: false };
        const report = await analyzePageLinkReport(inner, analysis, page, [page.path]);
        expect(report.complete).toBe(scenario !== "budget");
        expect(report.hasErrors).toBe(scenario === "error");
        expect(report.diagnostics).toHaveLength(16);
        expect(report.diagnostics.at(-1)?.code).toBe("analysis.truncated");
        expect(report.diagnostics.some((value) => value.code === "page.link_analysis_incomplete")).toBe(false);
        expect(report.diagnostics.some((value) => value.severity === "error")).toBe(scenario === "error");
        expect(routeBatches).toBe(1);
        expect(pageBatches).toBe(1);
        expect(await analyzePageLinks(inner, analysis, page, [page.path])).toEqual(report.diagnostics);
    },
);
