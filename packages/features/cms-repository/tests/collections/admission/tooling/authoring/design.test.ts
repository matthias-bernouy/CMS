import { expect, test } from "bun:test";
import { collectionAuthoringDiagnostics } from "@bernouy/cms-repository/collections/build";
import type { CollectionRelease, CollectionBloc } from "@bernouy/cms-repository/collections";

function bloc(id: string, slot = "content", overrides: Partial<CollectionBloc> = {}): CollectionBloc {
    return {
        id,
        kind: "component",
        label: "label",
        description: "description",
        categories: ["content"],
        root: { accepts: ["h2"] },
        slots: { [slot]: { accepts: [{ kind: "native-content", profile: "phrasing" }], min: 1, max: 1 } },
        markup: `<slot name="${slot}"></slot>`,
        style: ":scope { padding: 2px; }",
        uses: [],
        requires: [],
        ...overrides,
    } as CollectionBloc;
}

const diagnostics = (...blocs: CollectionBloc[]) =>
    collectionAuthoringDiagnostics({ blocs, examples: [] } as unknown as CollectionRelease);

test("design reports normalized clone groups independently of resource and slot names", () => {
    const result = diagnostics(
        bloc("atlas-alpha", "title"),
        bloc("atlas-beta", "heading"),
        bloc("atlas-gamma", "arbitrary"),
    );
    expect(result).toEqual([
        expect.objectContaining({
            code: "design.similar_blocs",
            severity: "warning",
            relatedResources: ["atlas-alpha", "atlas-beta", "atlas-gamma"],
        }),
    ]);
});

test("different roots, slots, destinations, media states and behavior do not become exact clones", () => {
    const original = bloc("atlas-alpha");
    for (const variant of [
        bloc("atlas-beta", "content", { root: { accepts: ["h3"] } }),
        bloc("atlas-beta", "content", {
            slots: { content: { accepts: [{ kind: "native-content", profile: "prose" }], min: 0, max: 8 } },
        }),
        bloc("atlas-beta", "content", { markup: '<a href="/other"><slot name="content"></slot></a>' }),
        bloc("atlas-beta", "content", { style: "@media (min-width: 900px) {:scope {padding: 2px}}" }),
        bloc("atlas-beta", "content", { runtime: { viewJS: "different behavior" } }),
    ]) {
        expect(diagnostics(original, variant)).toEqual([]);
    }
});

test("near-clone vectors require the same contracts and preserve CSS selector/media structure", () => {
    const style =
        ":scope {padding:2px;margin:3px;gap:4px;display:flex;align-items:center;justify-content:center;position:relative;inset:auto;overflow:hidden;border:none;outline:none;min-width:0;max-width:100%;width:auto;height:auto;min-height:0;max-height:none;box-sizing:border-box;opacity:1;isolation:isolate;flex-grow:0;flex-shrink:1;flex-basis:auto;order:0;z-index:auto;float:none;clear:none;visibility:visible;cursor:auto;user-select:auto;pointer-events:auto;white-space:normal;word-break:normal;text-align:start;text-decoration:none;line-height:normal;font-weight:400;font-style:normal;letter-spacing:normal;vertical-align:baseline;}";
    const extended = `${style}:scope {margin-top:1px;margin-right:1px;margin-bottom:1px;margin-left:1px;padding-top:1px;padding-right:1px;padding-bottom:1px;padding-left:1px;row-gap:1px;column-gap:1px;}`;
    const first = bloc("atlas-alpha", "content", { style: extended });
    const second = bloc("atlas-beta", "content", { style: extended.replace("padding:2px", "padding:3px") });
    expect(diagnostics(first, second).some((issue) => issue.code === "design.near_blocs")).toBe(true);
    const otherContract = bloc("atlas-gamma", "content", { ...second, id: "atlas-gamma", root: { accepts: ["p"] } });
    expect(diagnostics(first, otherContract)).toEqual([]);
});
