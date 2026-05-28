import { describe, test, expect } from "bun:test";
import { findUsedBlocTags } from "src/delivery/core/blocs/findUsedBlocs";

describe("findUsedBlocTags", () => {
    test("returns empty when the bloc list is empty", () => {
        expect(findUsedBlocTags("<p>hi</p>", [])).toEqual([]);
    });

    test("returns empty when no registered tag appears in content", () => {
        expect(findUsedBlocTags("<p>hi</p>", [{ id: "my-card" }])).toEqual([]);
    });

    test("detects a single used tag", () => {
        expect(findUsedBlocTags("<my-card></my-card>", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects self-closing usage", () => {
        expect(findUsedBlocTags("<my-card />", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("detects tags with attributes", () => {
        expect(findUsedBlocTags(`<my-card foo="bar"></my-card>`, [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("is case-insensitive", () => {
        expect(findUsedBlocTags("<MY-CARD></MY-CARD>", [{ id: "my-card" }])).toEqual(["my-card"]);
    });

    test("does NOT match a tag that only appears as a substring of another", () => {
        // `<my-card-extra>` must not match `my-card`.
        expect(findUsedBlocTags("<my-card-extra></my-card-extra>", [{ id: "my-card" }])).toEqual([]);
    });

    test("returns every registered tag that appears", () => {
        const used = findUsedBlocTags(
            "<my-card></my-card><other-bloc></other-bloc>",
            [
                { id: "my-card" },
                { id: "other-bloc" },
                { id: "unused" },
            ],
        );
        expect(used.sort()).toEqual(["my-card", "other-bloc"]);
    });
});
