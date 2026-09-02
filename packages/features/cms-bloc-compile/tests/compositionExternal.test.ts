import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("Composition artifact", () => {
    test("keeps its template out of the client view bundle", async () => {
        const compositionHTML = "<base-nav></base-nav><slot></slot>";
        const bloc = await prepare_bloc(
            null,
            null,
            "Demo composition",
            "Composition",
            "",
            "demo-composition",
            undefined,
            undefined,
            {
                compositionHTML,
            },
        );

        expect(bloc.viewJS).toBe("");
        expect(bloc.compositionHTML).toBe(compositionHTML);
        expect(bloc.editorJS).not.toContain("window.p9r.Composition");
    });

    test("keeps historical client compositions installable during an upgrade", async () => {
        const view = new File(
            [
                `import { Composition } from "@bernouy/components/base";`,
                `class LegacyComposition extends Composition {`,
                `  constructor() { super({ template: "<slot></slot>" }); }`,
                `}`,
                `customElements.define("BE5_TAG_TO_BE_REPLACED", LegacyComposition);`,
            ],
            "Bloc.ts",
            { type: "text/typescript" },
        );

        const bloc = await prepare_bloc(view, null, "Legacy composition", "Composition", "", "legacy-composition");

        expect(bloc.viewJS).toContain("window.p9r.Composition");
        expect(bloc.viewJS).toContain("data-p9r-legacy-composition");
    });
});
