import { describe, test, expect } from "bun:test";
import { slugify } from "cms-control/core/validation/identifiers/slugify";

describe("slugify", () => {
    test("lowercases and kebab-cases spaces", () => {
        expect(slugify("My Provider")).toBe("my-provider");
    });
    test("collapses runs of non-alphanumerics to a single dash", () => {
        expect(slugify("a  __  b!!c")).toBe("a-b-c");
    });
    test("trims leading/trailing dashes", () => {
        expect(slugify("  --Hello--  ")).toBe("hello");
    });
    test("returns empty when nothing slug-able remains", () => {
        expect(slugify("!!!")).toBe("");
    });
});
