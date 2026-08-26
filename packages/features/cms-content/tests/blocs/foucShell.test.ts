import { describe, expect, test } from "bun:test";
import { buildBlocFoucShellCss } from "@bernouy/cms-content";

describe("buildBlocFoucShellCss", () => {
    test("does not cloak documents without used Blocs", () => {
        expect(buildBlocFoucShellCss([])).toBe("");
    });

    test("keeps Light DOM visible while used Blocs remain undefined", () => {
        expect(buildBlocFoucShellCss(["child-card", "root-card"])).toBe(
            "child-card:not(:defined),root-card:not(:defined){display:contents}",
        );
    });
});
