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
});
