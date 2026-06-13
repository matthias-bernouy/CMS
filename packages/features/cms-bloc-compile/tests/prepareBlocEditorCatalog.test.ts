import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("prepare_bloc editor catalog output", () => {
    test("uses the stable editor catalog runtime for blocs without editor source", async () => {
        const view = new File([
            "customElements.define('demo-card', class extends HTMLElement {});",
        ], "DemoCard.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            null,
            "Demo card",
            "Content",
            "A demo bloc",
            "demo-card",
        );

        expect(bloc.editorJS).toContain("window.p9rEditor.Editor");
        expect(bloc.editorJS).toContain("window.p9rEditor.registerEditor");
        expect(bloc.editorJS).toContain('props?.tag ?? "demo-card"');
        expect(bloc.editorJS).toContain('props?.label ?? "Demo card"');
        expect(bloc.editorJS).toContain('props?.category ?? "Content"');
        expect(bloc.editorJS).toContain("props?.editor ?? props?.cl");
        expect(bloc.editorJS).not.toContain("registerEditor_opaque");
        expect(bloc.viewJS).toContain("customElements.define");
    });
});
