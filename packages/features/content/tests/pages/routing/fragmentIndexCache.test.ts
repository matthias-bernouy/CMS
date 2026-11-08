import { expect, test } from "bun:test";
import { PageFragmentIndexCache, analyzeExpandedPageDocument } from "@bernouy/content/page-document";
import type { TPage } from "@bernouy/content";
import { fragmentReader } from "content/pages/core/routing/analysis/fragments";

const definitions = [{ id: "example--panel", kind: "component" as const, markupHTML: '<span id="old"></span>' }];

test("fragment indexes reuse exact evidence and invalidate content, revision and Bloc definitions", () => {
    const source = definitions.map((value) => ({ ...value }));
    const cache = new PageFragmentIndexCache(source);
    const target = page("one", '<div cms-bloc="example--panel"></div>');
    const first = cache.read(target, source);
    expect(cache.read(target, source)).toBe(first);
    expect(Object.isFrozen(first)).toBe(true);
    expect(Object.isFrozen(first.index)).toBe(true);
    expect(first.index.hasId("old")).toBe(true);
    expect(cache.read({ ...target, revision: 2 }, source)).not.toBe(first);
    const changed = cache.read({ ...target, content: '<span id="new"></span>' }, source);
    expect(changed.index.hasId("old")).toBe(false);
    expect(changed.index.hasId("new")).toBe(true);
    source[0]!.markupHTML = '<span id="replacement"></span>';
    expect(cache.read(target, source).index.hasId("replacement")).toBe(true);
    expect(cache.read(target, definitions).index.hasId("old")).toBe(true);
});

test("fragment cache entries and payloads stay bounded and failed analyses are not retained", () => {
    const cache = new PageFragmentIndexCache([], 2, 1200);
    const first = cache.read(page("one", '<span id="one"></span>'), []);
    cache.read(page("two", '<span id="two"></span>'), []);
    cache.read(page("three", '<span id="three"></span>'), []);
    expect(cache.size).toBe(2);
    expect(cache.retainedBytes).toBeLessThanOrEqual(1200);
    expect(cache.read(page("one", '<span id="one"></span>'), [])).not.toBe(first);
    cache.read(page("large", `<p>${"x".repeat(1200)}</p>`), []);
    expect(cache.size).toBe(2);
    const recursive = [
        { id: "example--loop", kind: "composition" as const, markupHTML: '<div cms-bloc="example--loop"></div>' },
    ];
    const failed = new PageFragmentIndexCache(recursive);
    for (let index = 0; index < 2; index++) {
        expect(() => failed.read(page("bad", '<div cms-bloc="example--loop"></div>'), recursive)).toThrow();
        expect(failed.size).toBe(0);
    }
});

test("warm destination evidence still consumes each source's node budget and retains current severity", () => {
    const cache = new PageFragmentIndexCache([]);
    const targets = Array.from({ length: 3 }, (_, index) =>
        page(String(index), `<div id="anchor">${"<span></span>".repeat(17_000)}</div>`),
    );
    for (const target of targets) {
        cache.read(target, []);
    }
    const source = analyzeExpandedPageDocument('<h1>Source</h1><a href="/target#anchor">Target</a>', []);
    const link = { element: source.root.querySelector("a")!, attribute: "href", fragment: "anchor" };
    const reader = fragmentReader(source, cache);
    expect(reader(link, targets[0]!, "error")).toEqual([]);
    expect(reader(link, targets[1]!, "error")).toEqual([]);
    expect(reader(link, targets[2]!, "error")[0]?.code).toBe("page.fragment_unverified");
    expect(fragmentReader(source, cache)(link, targets[2]!, "error")).toEqual([]);
    const missing = { ...link, fragment: "missing" };
    expect(fragmentReader(source, cache)(missing, targets[0]!, "error")[0]?.severity).toBe("error");
    expect(fragmentReader(source, cache)(missing, targets[0]!, "warning")[0]?.severity).toBe("warning");
});

function page(id: string, content: string): TPage {
    return { id, revision: 1, path: `/${id}`, title: id, description: "", tags: [], content, visible: true };
}
