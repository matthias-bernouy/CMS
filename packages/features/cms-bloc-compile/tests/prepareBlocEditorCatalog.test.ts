import { describe, expect, test } from "bun:test";
import { prepare_bloc } from "../src/exports";

describe("prepare_bloc editor catalog output", () => {
    test("uses the stable editor catalog runtime for blocs without editor source", async () => {
        const view = new File(["customElements.define('demo-card', class extends HTMLElement {});"], "DemoCard.ts", {
            type: "text/typescript",
        });
        const bloc = await prepare_bloc(view, null, "Demo card", "Content", "A demo bloc", "demo-card");

        expect(bloc.editorJS).toContain("window.p9rEditor.Editor");
        expect(bloc.editorJS).toContain("window.p9rEditor.registerEditor");
        expect(bloc.editorJS).toContain('??"demo-card"');
        expect(bloc.editorJS).toContain('??"Demo card"');
        expect(bloc.editorJS).toContain('??"Content"');
        expect(bloc.editorJS).toMatch(/editor:\w\?\.editor\?\?\w\?\.cl/);
        expect(bloc.viewJS).toContain("customElements.define");
    });

    test("keeps the opaque editor helper when a bloc imports it", async () => {
        const view = new File(["customElements.define('demo-card', class extends HTMLElement {});"], "DemoCard.ts", {
            type: "text/typescript",
        });
        const editor = new File(
            ["import { registerEditor_opaque } from '@bernouy/cms-control/editor';", "registerEditor_opaque();"],
            "DemoCardEditor.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, editor, "Demo card", "Content", "A demo bloc", "demo-card");

        expect(bloc.editorJS).toContain("window.p9rEditor.Editor");
        expect(bloc.editorJS).toContain("getStructureMode()");
        expect(bloc.editorJS).toContain('return"opaque"');
    });

    test("exposes binding constants to bloc editor bundles", async () => {
        const view = new File(["customElements.define('demo-form', class extends HTMLElement {});"], "DemoForm.ts", {
            type: "text/typescript",
        });
        const editor = new File(
            [
                "import { Editor, CMS_BINDING_ATTRIBUTES, registerEditor } from '@bernouy/cms-content/editor';",
                "class DemoFormEditor extends Editor { getSettings() { return [{ type: 'text', label: CMS_BINDING_ATTRIBUTES.source, attribute: CMS_BINDING_ATTRIBUTES.source }]; } }",
                "registerEditor({ editor: DemoFormEditor });",
            ],
            "DemoFormEditor.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, editor, "Demo form", "Forms", "", "demo-form");
        expect(bloc.editorJS).toContain("cms-source");
    });

    test("exposes binding constants through the control editor subpath", async () => {
        const view = new File(
            ["customElements.define('demo-control-form', class extends HTMLElement {});"],
            "DemoControlForm.ts",
            { type: "text/typescript" },
        );
        const editor = new File(
            [
                "import { Editor, CMS_BINDING_ATTRIBUTES, registerEditor } from '@bernouy/cms-control/editor';",
                "class DemoControlFormEditor extends Editor { getSettings() { return [{ type: 'text', label: CMS_BINDING_ATTRIBUTES.source, attribute: CMS_BINDING_ATTRIBUTES.source }]; } }",
                "registerEditor({ editor: DemoControlFormEditor });",
            ],
            "DemoControlFormEditor.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, editor, "Demo control form", "Forms", "", "demo-control-form");
        expect(bloc.editorJS).toContain("cms-source");
    });

    test("embeds default content into editor catalog registrations", async () => {
        const view = new File(["customElements.define('demo-card', class extends HTMLElement {});"], "DemoCard.ts", {
            type: "text/typescript",
        });
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
        expect(bloc.editorJS).toContain(
            '??"<demo-card variant=\\"featured\\"><p slot=\\"header\\">Title</p><p>Body</p></demo-card>"',
        );
    });

    test("escapes metadata in editor catalog registrations", async () => {
        const view = new File(["customElements.define('demo-grid', class extends HTMLElement {});"], "DemoGrid.ts", {
            type: "text/typescript",
        });
        const bloc = await prepare_bloc(
            view,
            null,
            `Grid "layout"`,
            "Layout",
            `Children can use bleed="wide|full".`,
            "demo-grid",
        );
        expect(() => new Function(bloc.editorJS)).not.toThrow();
        expect(bloc.editorJS).toContain(`??"Children can use bleed=\\"wide|full\\"."`);
    });
});
