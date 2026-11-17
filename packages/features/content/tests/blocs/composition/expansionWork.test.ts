import { expect, spyOn, test } from "bun:test";
import { expandCompositions } from "@bernouy/content";
import { parseHTML } from "linkedom";

test("expansion visits generated subtrees without rescanning the complete Page for every host", () => {
    const document = parseHTML("<html><body></body></html>").document;
    document.body.innerHTML = '<div cms-bloc="fixture-parent"></div>'.repeat(500);
    const scans = spyOn(document.body, "querySelectorAll");
    try {
        expandCompositions(document.body, [
            { id: "fixture-parent", kind: "composition", markupHTML: '<div cms-bloc="fixture-child"></div>' },
            { id: "fixture-child", kind: "component", markupHTML: '<p id="title">Text</p>' },
        ]);
        expect(scans.mock.calls.filter(([selector]) => selector === "[cms-bloc]")).toHaveLength(0);
    } finally {
        scans.mockRestore();
    }
    const ids = Array.from(document.querySelectorAll("[id]"), (node) => node.id);
    expect(ids).toHaveLength(500);
    expect(ids[0]).toBe("title");
    expect(ids.at(-1)).toBe("title--cms-500");
});

test("recursive expansion still refuses at its work limit and authoring retains its byte/node budget", () => {
    const document = parseHTML("<html><body></body></html>").document;
    document.body.innerHTML = '<div cms-bloc="fixture-cycle"></div>';
    expect(() =>
        expandCompositions(document.body, [
            { id: "fixture-cycle", kind: "composition", markupHTML: '<div cms-bloc="fixture-cycle"></div>' },
        ]),
    ).toThrow("safety limit");
    document.body.innerHTML = '<div cms-bloc="fixture-large"></div>';
    expect(() =>
        expandCompositions(
            document.body,
            [{ id: "fixture-large", kind: "component", markupHTML: "<span></span>".repeat(50_001) }],
            "render",
            new WeakMap(),
        ),
    ).toThrow("expansion work budget");
});
