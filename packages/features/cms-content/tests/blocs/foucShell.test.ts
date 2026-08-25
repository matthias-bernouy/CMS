import { describe, expect, test } from "bun:test";
import { buildBlocFoucShellCss } from "@bernouy/cms-content";

describe("buildBlocFoucShellCss", () => {
    test("does not cloak documents without used Blocs", () => {
        expect(buildBlocFoucShellCss([])).toBe("");
    });

    test("cloaks the body while any used Bloc remains undefined", () => {
        expect(buildBlocFoucShellCss(["child-card", "root-card"])).toBe(
            "html:has(child-card:not(:defined)),html:has(root-card:not(:defined)){background:#fff}" +
                "html:has(child-card:not(:defined)) body,html:has(root-card:not(:defined)) body{visibility:hidden}",
        );
    });
});
