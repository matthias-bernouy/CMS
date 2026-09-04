import { describe, expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertValidJavaScriptArtifact, runBuild } from "../src/core/prepare_bloc";
import { prepare_bloc } from "../src/exports";

describe("prepare_bloc build output", () => {
    test("keeps native source while omitting its browser view script", async () => {
        const view = new File(["// Native image behavior is provided directly by the browser."], "Bloc.ts", {
            type: "text/typescript",
        });
        const source = { "Bloc.ts": Buffer.from("// Native source retained for authoring.").toString("base64") };

        const bloc = await prepare_bloc(view, null, "Image", "Basic", "", "img", source, undefined, { native: true });

        expect(bloc.viewJS).toBe("");
        expect(bloc.source).toEqual(source);
        expect(() => new Function(bloc.editorJS)).not.toThrow();
    });

    test("minifies view and editor browser bundles", async () => {
        const view = new File(
            ["// VIEW_COMMENT_TO_REMOVE", "customElements.define('demo-minified', class extends HTMLElement {});"],
            "DemoMinified.ts",
            { type: "text/typescript" },
        );
        const editor = new File(
            [
                "// EDITOR_COMMENT_TO_REMOVE",
                "import { Editor, registerEditor } from '@bernouy/cms-content/editor';",
                "class DemoMinifiedEditor extends Editor {}",
                "registerEditor({ editor: DemoMinifiedEditor });",
            ],
            "DemoMinifiedEditor.ts",
            { type: "text/typescript" },
        );

        const bloc = await prepare_bloc(view, editor, "Minified demo", "Content", "", "demo-minified");

        expect(bloc.viewJS).not.toContain("VIEW_COMMENT_TO_REMOVE");
        expect(bloc.editorJS).not.toContain("EDITOR_COMMENT_TO_REMOVE");
        expect(() => new Function(bloc.viewJS)).not.toThrow();
        expect(() => new Function(bloc.editorJS)).not.toThrow();
    });

    test("rejects invalid final JavaScript with an actionable artifact label", () => {
        expect(() => assertValidJavaScriptArtifact("try {", "view bundle for broken-card")).toThrow(
            /Invalid generated JavaScript \(view bundle for broken-card\):.*Check the bloc source and manifest metadata; the artifact was not persisted\./,
        );
    });

    test("materializes bundled source files used by view imports", async () => {
        const view = new File(
            [
                `import template from "./template.html" with { type: "text" };`,
                `import css from "./style.css" with { type: "text" };`,
                `customElements.define("demo-separated", class extends HTMLElement { static template = template; static css = css; });`,
            ],
            "Bloc.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, null, "Separated demo", "Content", "", "demo-separated", {
            "template.html": Buffer.from("<p>Separated template</p>").toString("base64"),
            "style.css": Buffer.from(":host { display: block; }").toString("base64"),
        });

        expect(bloc.viewJS).toContain("Separated template");
        expect(bloc.viewJS).toContain("display: block");
    });

    test("resolves imports from a nested declared view path", async () => {
        const view = new File(
            [
                `import { label } from "../label";\n` +
                    `customElements.define("BE5_TAG_TO_BE_REPLACED", class extends HTMLElement { label = label; });`,
            ],
            "Bloc.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(
            view,
            null,
            "Nested demo",
            "Content",
            "",
            "demo-nested",
            { "label.ts": Buffer.from(`export const label = "Nested";`).toString("base64") },
            undefined,
            { viewPath: "controller/Bloc.ts" },
        );

        expect(bloc.viewJS).toContain("Nested");
    });

    test("rejects source paths escaping the temporary bundle", async () => {
        const view = new File(["customElements.define('demo-card', class extends HTMLElement {});"], "DemoCard.ts", {
            type: "text/typescript",
        });
        await expect(
            prepare_bloc(view, null, "Demo card", "Content", "", "demo-card", {
                "../outside.js": Buffer.from("unsafe").toString("base64"),
            }),
        ).rejects.toThrow("Invalid bloc source path: ../outside.js");
    });

    test.failing("rejects imports that resolve outside the uploaded source bundle", async () => {
        const outsideDir = await mkdtemp(join(tmpdir(), "p9r-bloc-outside-"));
        const outsidePath = join(outsideDir, "outside.ts");
        await Bun.write(outsidePath, 'export const marker = "OUTSIDE_BUNDLE";');
        const view = new File(
            [
                `import { marker } from ${JSON.stringify(outsidePath)};`,
                "customElements.define('demo-outside', class extends HTMLElement { static marker = marker; });",
            ],
            "Bloc.ts",
            { type: "text/typescript" },
        );
        try {
            await expect(prepare_bloc(view, null, "Outside import", "Security", "", "demo-outside")).rejects.toThrow();
        } finally {
            await rm(outsideDir, { recursive: true, force: true });
        }
    });

    test("exposes the Component base to view bundles", async () => {
        const view = new File(
            [
                `import { Component } from "@bernouy/components/base";`,
                `export class DemoComponent extends Component {`,
                `  constructor() { super({ template: "<slot></slot>" }); }`,
                `}`,
            ],
            "DemoComponent.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, null, "Demo component", "Content", "", "demo-component");
        expect(bloc.viewJS).toContain("window.p9r.Component");
        expect(bloc.viewJS).toContain("demo-component");

        const definitions = new Map<string, unknown>();
        const customElements = {
            define: (tag: string, constructor: unknown) => definitions.set(tag, constructor),
            get: (tag: string) => definitions.get(tag),
        };
        new Function("window", "customElements", "HTMLElement", bloc.viewJS)(
            { p9r: { Component: class {} } },
            customElements,
            class {},
        );
        expect(definitions.get("demo-component")).toBeFunction();
    });

    test("keeps legacy self-registering views compatible without registering twice", async () => {
        const view = new File(
            ["customElements.define('legacy-card', class extends HTMLElement {});"],
            "LegacyCard.ts",
            { type: "text/typescript" },
        );
        const bloc = await prepare_bloc(view, null, "Legacy card", "Content", "", "legacy-card");
        const definitions = new Map<string, unknown>();
        let registrations = 0;
        const customElements = {
            define: (tag: string, constructor: unknown) => {
                registrations++;
                definitions.set(tag, constructor);
            },
            get: (tag: string) => definitions.get(tag),
        };

        new Function("customElements", "HTMLElement", bloc.viewJS)(customElements, class {});
        expect(registrations).toBe(1);
        expect(definitions.get("legacy-card")).toBeFunction();
    });

    test("reports Bun build failures instead of returning an empty view bundle", async () => {
        const view = new File(["import './missing.js';"], "DemoCard.ts", { type: "text/typescript" });
        await expect(prepare_bloc(view, null, "Demo card", "Content", "", "demo-card")).rejects.toThrow(
            /Build failed \(view bundle for demo-card\):/,
        );
    });

    test("reports missing Bun build outputs", async () => {
        const build = async () => ({ success: true, outputs: [], logs: [] }) as unknown as Bun.BuildOutput;
        await expect(runBuild({ entrypoints: ["demo-card.js"] }, "view bundle for demo-card", build)).rejects.toThrow(
            /Build failed \(view bundle for demo-card\):\n  \(no details from Bun.build\)/,
        );
    });
});
