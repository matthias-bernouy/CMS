import { expect, test } from "bun:test";
import { InMemoryContentRepository, ValidatingContentRepository } from "@bernouy/cms-content";

async function fixture(markup = "<main><slot></slot></main>") {
    const inner = new InMemoryContentRepository();
    await inner.createBloc({
        id: "test-shell",
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
    const content = `<div cms-bloc="test-shell">${Array.from({ length: 40 }, (_, i) => `<a href="/target-${i}">Link</a>`).join("")}</div>`;
    const feedback = await repo.insertPage("/source", "Source", content);
    expect(batches).toBe(1);
    expect(feedback?.diagnostics.filter((item) => item.code === "page.link_analysis_incomplete")).toHaveLength(8);
});

test("analysis is instance scoped even when another instance has a matching target route", async () => {
    const source = await fixture('<main><a href="/target">Target</a></main>');
    const neighbour = await fixture();
    await neighbour.repo.insertPage("/target", "Private neighbour Page");
    await source.repo.insertPage("/source", "Source", '<div cms-bloc="test-shell"></div>');
    const page = (await source.repo.getPage("/source"))!;
    await expect(source.repo.updatePage({ id: page.id, visible: true }, page.revision)).rejects.toThrow(
        "unavailable route",
    );
    expect((await source.repo.getPage("/source"))?.revision).toBe(page.revision);
});

test("a self alias checks fragment IDs against the candidate document rather than stored content", async () => {
    const { repo } = await fixture();
    await repo.updateSystem({ site: { language: "en" } } as never);
    await repo.insertPage("/old", "Source", '<div cms-bloc="test-shell"><p id="old">Old</p></div>');
    let page = (await repo.getPage("/old"))!;
    page = await repo.setPagePaths(page.id, { en: "/new" }, undefined, undefined, page.revision);
    const content = '<div cms-bloc="test-shell"><a href="/old#new">New</a><p id="new">New</p></div>';
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
    await repo.insertPage("/source", "Source", '<div cms-bloc="test-shell"><a href="/target">Target</a></div>');
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
                content: '<div cms-bloc="test-shell"><a href="/fr/cible">Translation</a></div>',
            },
            page.revision,
        ),
    ).rejects.toMatchObject({
        diagnostics: [expect.objectContaining({ code: "page.route_missing", severity: "error" })],
    });
    expect(await inner.getPageById(page.id)).toEqual(before);
});

test("replacing a Bloc refuses new HTML errors in indirect Page consumers before persistence", async () => {
    const { inner, repo } = await fixture('<main><div cms-bloc="test-child"></div></main>');
    const child = await inner.createBloc({
        id: "test-child",
        name: "Child",
        group: "Test",
        description: "Test",
        viewJS: "",
        markupHTML: "<p>Child</p>",
        kind: "component",
        root: { accepts: ["div"] },
        ownership: { kind: "code-managed" },
    });
    await inner.insertPage("/source", "Source", '<div cms-bloc="test-shell"></div>');
    await expect(repo.replaceBloc({ ...child, markupHTML: "<main>Nested</main>" })).rejects.toThrow("nested inside");
    expect((await inner.getBlocRecord(child.id))?.artifact?.markupHTML).toBe("<p>Child</p>");
});
