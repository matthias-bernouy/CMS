import { describe, test, expect } from "bun:test";
import { groupBlocsBySignature } from "cms-delivery/core/blocs/groupBlocsBySignature";

describe("groupBlocsBySignature", () => {
    test("blocs used on the same set of pages land in one group", () => {
        const { tagToGroup } = groupBlocsBySignature([
            ["nav", "footer"],
            ["nav", "footer"],
        ]);
        expect(tagToGroup.get("nav")).toBe(tagToGroup.get("footer"));
    });

    test("separates clusters: a product bloc never groups with a blog bloc", () => {
        // pages 0,1 = blog ; pages 2,3 = product ; nav+footer everywhere.
        const { tagToGroup, groups } = groupBlocsBySignature([
            ["nav", "footer", "blogA", "blogB"],
            ["nav", "footer", "blogA", "blogB"],
            ["nav", "footer", "prodA"],
            ["nav", "footer", "prodA"],
        ]);
        expect(tagToGroup.get("nav")).toBe(tagToGroup.get("footer"));            // core together
        expect(tagToGroup.get("blogA")).toBe(tagToGroup.get("blogB"));           // blog cluster together
        expect(tagToGroup.get("blogA")).not.toBe(tagToGroup.get("nav"));         // not in core
        expect(tagToGroup.get("prodA")).not.toBe(tagToGroup.get("blogA"));       // no cross-cluster leak
        expect(tagToGroup.get("prodA")).not.toBe(tagToGroup.get("nav"));
        // consistency: every group's tags map back to that group
        for (const [gid, tags] of groups) {
            for (const t of tags) expect(tagToGroup.get(t)).toBe(gid);
        }
    });

    test("auto-splits the 'core' when some pages omit part of it", () => {
        // a,b on all 3 pages; c only on pages 0,1 (page 2 omits it) → different signature.
        const { tagToGroup } = groupBlocsBySignature([
            ["a", "b", "c"],
            ["a", "b", "c"],
            ["a", "b"],
        ]);
        expect(tagToGroup.get("a")).toBe(tagToGroup.get("b"));
        expect(tagToGroup.get("c")).not.toBe(tagToGroup.get("a"));
    });

    test("a bloc used on a single page is its own group (tail)", () => {
        const { groups, tagToGroup } = groupBlocsBySignature([
            ["nav", "rare"],
            ["nav"],
        ]);
        expect(groups.get(tagToGroup.get("rare")!)).toEqual(["rare"]);
        expect(tagToGroup.get("rare")).not.toBe(tagToGroup.get("nav"));
    });

    test("is deterministic and tag-order-independent within a page", () => {
        const a = groupBlocsBySignature([["x", "y"], ["x", "y", "z"]]);
        const b = groupBlocsBySignature([["y", "x"], ["z", "y", "x"]]);
        expect([...a.groups.keys()].sort()).toEqual([...b.groups.keys()].sort());
        expect(a.tagToGroup.get("x")).toBe(b.tagToGroup.get("x"));
    });

    test("dedups repeated tags within a page", () => {
        const { groups } = groupBlocsBySignature([["a", "a", "b"]]);
        expect([...groups.values()]).toEqual([["a", "b"]]);
    });

    test("empty input → empty manifest", () => {
        const { groups, tagToGroup } = groupBlocsBySignature([]);
        expect(groups.size).toBe(0);
        expect(tagToGroup.size).toBe(0);
    });
});
