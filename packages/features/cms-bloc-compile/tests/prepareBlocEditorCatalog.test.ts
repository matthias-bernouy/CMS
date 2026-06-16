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
        expect(bloc.viewJS).toContain("customElements.define");
    });

    test("keeps the opaque editor helper when a bloc imports it", async () => {
        const view = new File([
            "customElements.define('demo-card', class extends HTMLElement {});",
        ], "DemoCard.ts", { type: "text/typescript" });
        const editor = new File([
            "import { registerEditor_opaque } from '@bernouy/cms-control/editor';",
            "registerEditor_opaque();",
        ], "DemoCardEditor.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            editor,
            "Demo card",
            "Content",
            "A demo bloc",
            "demo-card",
        );

        expect(bloc.editorJS).toContain("window.p9rEditor.Editor");
        expect(bloc.editorJS).toContain("registerEditor_opaque");
        expect(bloc.editorJS).toContain("getStructureMode()");
        expect(bloc.editorJS).toContain('return "opaque";');
    });

    test("embeds default content into editor catalog registrations", async () => {
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
            undefined,
            `<demo-card variant="featured"><p slot="header">Title</p><p>Body</p></demo-card>`,
        );

        expect(bloc.editorJS).toContain('defaultContent: props?.defaultContent ?? "<demo-card variant=\\"featured\\"><p slot=\\"header\\">Title</p><p>Body</p></demo-card>"');
    });

    test("escapes metadata in editor catalog registrations", async () => {
        const view = new File([
            "customElements.define('demo-grid', class extends HTMLElement {});",
        ], "DemoGrid.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            null,
            `Grid "layout"`,
            "Layout",
            `Children can use bleed="wide|full".`,
            "demo-grid",
        );

        expect(() => new Function(bloc.editorJS)).not.toThrow();
        expect(bloc.editorJS).toContain(`description: props?.description ?? "Children can use bleed=\\"wide|full\\"."`);
    });
});
