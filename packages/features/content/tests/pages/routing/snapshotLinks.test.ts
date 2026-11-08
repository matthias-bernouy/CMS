import { expect, test } from "bun:test";
import { InMemoryContentRepository, analyzePageLinkReport } from "@bernouy/content";
import { analyzeExpandedPageDocument, PageFragmentIndexCache } from "@bernouy/content/page-document";

test("a captured Page snapshot validates more destinations without additional document reads", async () => {
    const repository = new InMemoryContentRepository();
    for (let index = 0; index < 40; index++) {
        await repository.insertPage(`/target-${index}`, "Target", '<h1 id="anchor">Target</h1>');
        const page = await repository.getPage(`/target-${index}`);
        await repository.updatePage({ id: page!.id, visible: true }, page!.revision);
    }
    const snapshotPages = new Map((await repository.getAllPages()).map((page) => [page.id, page]));
    let reads = 0;
    repository.getPagesByIds = async () => {
        reads++;
        throw new Error("Batch analysis must use its captured Pages");
    };
    const html = `<h1>Source</h1>${Array.from({ length: 40 }, (_, index) => `<a href="/target-${index}#anchor">Target</a>`).join("")}`;
    const source = { path: "/source", visible: true };
    const analysis = analyzeExpandedPageDocument(html, []);
    const options = { snapshotPages, fragmentIndexes: new PageFragmentIndexCache([]) };
    expect(await analyzePageLinkReport(repository, analysis, source, [source.path], options)).toMatchObject({
        complete: true,
        hasErrors: false,
    });
    expect(reads).toBe(0);
    const target = [...snapshotPages.values()][0]!;
    snapshotPages.delete(target.id);
    const missing = await analyzePageLinkReport(repository, analysis, source, [source.path], options);
    expect(missing.hasErrors).toBe(true);
    expect(missing.diagnostics.some(({ code }) => code === "page.route_missing")).toBe(true);
    snapshotPages.set(target.id, { ...target, visible: false, content: "<h1>Changed</h1>" });
    const draft = await analyzePageLinkReport(repository, analysis, source, [source.path], options);
    expect(draft.hasErrors).toBe(false);
    expect(draft.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.fragment_missing", severity: "warning" }),
    );
    expect(reads).toBe(0);
    const excessive = analyzeExpandedPageDocument(`<h1>Source</h1>${'<a href="/target-1">Target</a>'.repeat(257)}`, []);
    await expect(analyzePageLinkReport(repository, excessive, source, [source.path], options)).rejects.toThrow(
        "256 effective links",
    );
});

test("preloaded Pages cannot make a foreign route available", async () => {
    const source = new InMemoryContentRepository();
    const neighbour = new InMemoryContentRepository();
    await neighbour.insertPage("/private", "Private", '<h1 id="anchor">Private</h1>');
    const foreign = await neighbour.getPage("/private");
    const analysis = analyzeExpandedPageDocument('<h1>Source</h1><a href="/private#anchor">Private</a>', []);
    const report = await analyzePageLinkReport(source, analysis, { path: "/source", visible: true }, ["/source"], {
        snapshotPages: new Map([[foreign!.id, foreign!]]),
    });
    expect(report.hasErrors).toBe(true);
    expect(report.diagnostics).toContainEqual(
        expect.objectContaining({ code: "page.route_missing", severity: "error" }),
    );
});
