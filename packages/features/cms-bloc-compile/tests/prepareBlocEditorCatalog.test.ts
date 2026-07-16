import { describe, expect, test } from "bun:test";
import { assertValidJavaScriptArtifact, runBuild } from "../src/core/prepare_bloc";
import { prepare_bloc } from "../src/exports";

describe("prepare_bloc editor catalog output", () => {
    test("keeps native source while omitting its browser view script", async () => {
        const view = new File([
            "// Native image behavior is provided directly by the browser.",
        ], "Bloc.ts", { type: "text/typescript" });
        const source = {
            "Bloc.ts": Buffer.from("// Native source retained for authoring.").toString("base64"),
        };

        const bloc = await prepare_bloc(
            view,
            null,
            "Image",
            "Basic",
            "",
            "img",
            source,
            undefined,
            { native: true },
        );

        expect(bloc.viewJS).toBe("");
        expect(bloc.source).toEqual(source);
        expect(() => new Function(bloc.editorJS)).not.toThrow();
    });

    test("minifies view and editor browser bundles", async () => {
        const view = new File([
            "// VIEW_COMMENT_TO_REMOVE",
            "customElements.define('demo-minified', class extends HTMLElement {});",
        ], "DemoMinified.ts", { type: "text/typescript" });
        const editor = new File([
            "// EDITOR_COMMENT_TO_REMOVE",
            "import { Editor, registerEditor } from '@bernouy/cms-content/editor';",
            "class DemoMinifiedEditor extends Editor {}",
            "registerEditor({ editor: DemoMinifiedEditor });",
        ], "DemoMinifiedEditor.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            editor,
            "Minified demo",
            "Content",
            "",
            "demo-minified",
        );

        expect(bloc.viewJS).not.toContain("VIEW_COMMENT_TO_REMOVE");
        expect(bloc.editorJS).not.toContain("EDITOR_COMMENT_TO_REMOVE");
        expect(() => new Function(bloc.viewJS)).not.toThrow();
        expect(() => new Function(bloc.editorJS)).not.toThrow();
    });

    test("rejects invalid final JavaScript with an actionable artifact label", () => {
        expect(() => assertValidJavaScriptArtifact("try {", "view bundle for broken-card"))
            .toThrow(
                /Invalid generated JavaScript \(view bundle for broken-card\):.*Check the bloc source and manifest metadata; the artifact was not persisted\./,
            );
    });

    test("materializes bundled source files used by view imports", async () => {
        const view = new File([
            `import template from "./template.html" with { type: "text" };`,
            `import css from "./style.css" with { type: "text" };`,
            `customElements.define("demo-separated", class extends HTMLElement { static template = template; static css = css; });`,
        ], "Bloc.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            null,
            "Separated demo",
            "Content",
            "",
            "demo-separated",
            {
                "template.html": Buffer.from("<p>Separated template</p>").toString("base64"),
                "style.css": Buffer.from(":host { display: block; }").toString("base64"),
            },
        );

        expect(bloc.viewJS).toContain("Separated template");
        expect(bloc.viewJS).toContain("display: block");
    });

    test("rejects source paths escaping the temporary bundle", async () => {
        const view = new File([
            "customElements.define('demo-card', class extends HTMLElement {});",
        ], "DemoCard.ts", { type: "text/typescript" });

        await expect(prepare_bloc(
            view,
            null,
            "Demo card",
            "Content",
            "",
            "demo-card",
            { "../outside.js": Buffer.from("unsafe").toString("base64") },
        )).rejects.toThrow("Invalid bloc source path: ../outside.js");
    });

    test("exposes the Light DOM Composition base to view bundles", async () => {
        const view = new File([
            `import { Composition } from "@bernouy/components/base";`,
            `export class DemoComposition extends Composition {`,
            `  constructor() { super({ template: "<p>Demo</p>" }); }`,
            `}`,
        ], "DemoComposition.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            null,
            "Demo composition",
            "Composition",
            "",
            "demo-composition",
        );

        expect(bloc.viewJS).toContain("window.p9r.Composition");
    });

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
        expect(bloc.editorJS).toContain('??"demo-card"');
        expect(bloc.editorJS).toContain('??"Demo card"');
        expect(bloc.editorJS).toContain('??"Content"');
        expect(bloc.editorJS).toMatch(/editor:\w\?\.editor\?\?\w\?\.cl/);
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
        expect(bloc.editorJS).toContain("getStructureMode()");
        expect(bloc.editorJS).toContain('return"opaque"');
    });

    test("exposes binding constants to bloc editor bundles", async () => {
        const view = new File([
            "customElements.define('demo-form', class extends HTMLElement {});",
        ], "DemoForm.ts", { type: "text/typescript" });
        const editor = new File([
            "import { Editor, CMS_BINDING_ATTRIBUTES, registerEditor } from '@bernouy/cms-content/editor';",
            "class DemoFormEditor extends Editor { getSettings() { return [{ type: 'text', label: CMS_BINDING_ATTRIBUTES.source, attribute: CMS_BINDING_ATTRIBUTES.source }]; } }",
            "registerEditor({ editor: DemoFormEditor });",
        ], "DemoFormEditor.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            editor,
            "Demo form",
            "Forms",
            "",
            "demo-form",
        );

        expect(bloc.editorJS).toContain("cms-source");
    });

    test("exposes binding constants through the control editor subpath", async () => {
        const view = new File([
            "customElements.define('demo-control-form', class extends HTMLElement {});",
        ], "DemoControlForm.ts", { type: "text/typescript" });
        const editor = new File([
            "import { Editor, CMS_BINDING_ATTRIBUTES, registerEditor } from '@bernouy/cms-control/editor';",
            "class DemoControlFormEditor extends Editor { getSettings() { return [{ type: 'text', label: CMS_BINDING_ATTRIBUTES.source, attribute: CMS_BINDING_ATTRIBUTES.source }]; } }",
            "registerEditor({ editor: DemoControlFormEditor });",
        ], "DemoControlFormEditor.ts", { type: "text/typescript" });

        const bloc = await prepare_bloc(
            view,
            editor,
            "Demo control form",
            "Forms",
            "",
            "demo-control-form",
        );

        expect(bloc.editorJS).toContain("cms-source");
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

        expect(bloc.editorJS).toContain('??"<demo-card variant=\\"featured\\"><p slot=\\"header\\">Title</p><p>Body</p></demo-card>"');
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
        expect(bloc.editorJS).toContain(`??"Children can use bleed=\\"wide|full\\"."`);
    });

    test("reports Bun build failures instead of returning an empty view bundle", async () => {
        const view = new File(["import './missing.js';"], "DemoCard.ts", { type: "text/typescript" });

        await expect(prepare_bloc(view, null, "Demo card", "Content", "", "demo-card"))
            .rejects.toThrow(/Build failed \(view bundle for demo-card\):/);
    });

    test("reports missing Bun build outputs", async () => {
        const build = async () => ({
            success: true,
            outputs: [],
            logs:    [],
        }) as unknown as Bun.BuildOutput;

        await expect(runBuild({ entrypoints: ["demo-card.js"] }, "view bundle for demo-card", build))
            .rejects.toThrow(/Build failed \(view bundle for demo-card\):\n  \(no details from Bun.build\)/);
    });
});
