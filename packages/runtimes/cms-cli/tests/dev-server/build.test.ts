import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { buildDevBloc } from "cms-cli/dev-server/bloc-build/index";
import type { DevBloc } from "cms-cli/dev-server/scan";

function tmpBloc(files: Record<string, string>): string {
    const root = mkdtempSync(join(tmpdir(), "p9r-dev-build-"));
    for (const [rel, content] of Object.entries(files)) {
        const full = join(root, rel);
        const dir = full.substring(0, full.lastIndexOf("/"));
        mkdirSync(dir, { recursive: true });
        writeFileSync(full, content);
    }
    return root;
}

describe("buildDevBloc", () => {
    test("builds an internal component without an editor catalogue entry", async () => {
        const folder = tmpBloc({
            "Bloc.ts": `customElements.define("BE5_TAG_TO_BE_REPLACED", class extends HTMLElement {});`,
        });
        const bloc: DevBloc = {
            folder,
            manifest: { internal: true, bloc: "./Bloc.ts", "default-tag": "site-shell-controller" },
            tag: "site-shell-controller",
            label: "Site shell controller",
            group: "Layout",
            description: "Internal behavior",
            internal: true,
            ownership: { kind: "code-managed" },
            entry: join(folder, "Bloc.ts"),
        };

        const built = await buildDevBloc(bloc);

        expect(built.internal).toBeTrue();
        expect(built.viewJS).toContain("site-shell-controller");
        expect(built.editorJS).toBe("");
    });

    test("injects manifest defaultContent file content into the dev editor bundle", async () => {
        const folder = tmpBloc({
            "Figure.ts": "export class Figure extends HTMLElement {}",
            "BlocEditor.ts": `
                import { Editor } from "@bernouy/cms-control/editor";
                export class FigureEditor extends Editor {}
            `,
            "default.html": `<base-figure><p slot="caption">Caption</p></base-figure>`,
        });
        const bloc: DevBloc = {
            folder,
            manifest: {
                editor: "./BlocEditor.ts",
                bloc: "./Figure.ts",
                "default-tag": "base-figure",
                defaultContent: "./default.html",
            },
            tag: "base-figure",
            label: "Figure",
            group: "Content",
            description: "Image with caption",
            internal: false,
            ownership: { kind: "code-managed" },
            entry: join(folder, "Figure.ts"),
            editorEntry: join(folder, "BlocEditor.ts"),
        };

        const built = await buildDevBloc(bloc);

        expect(built.editorJS).toContain(
            'defaultContent: props?.defaultContent ?? "<base-figure><p slot=\\"caption\\">Caption</p></base-figure>"',
        );
        expect(built.editorJS).not.toContain("BE5_DEFAULT_CONTENT_TO_BE_REPLACED");
    });

    test("escapes manifest metadata before injecting it into the dev editor bundle", async () => {
        const folder = tmpBloc({
            "Grid.ts": "export class Grid extends HTMLElement {}",
            "BlocEditor.ts": `
                import { Editor } from "@bernouy/cms-control/editor";
                export class GridEditor extends Editor {}
            `,
        });
        const bloc: DevBloc = {
            folder,
            manifest: {
                editor: "./BlocEditor.ts",
                bloc: "./Grid.ts",
                "default-tag": "base-grid",
            },
            tag: "base-grid",
            label: `Grid "layout"`,
            group: "Layout",
            description: `Children can use bleed="wide|full".`,
            internal: false,
            ownership: { kind: "code-managed" },
            entry: join(folder, "Grid.ts"),
            editorEntry: join(folder, "BlocEditor.ts"),
        };

        const built = await buildDevBloc(bloc);

        expect(() => new Function(built.editorJS)).not.toThrow();
        expect(built.editorJS).toContain(
            `description: props?.description ?? "Children can use bleed=\\"wide|full\\"."`,
        );
    });

    test("builds native editor-only blocs without registering a custom element", async () => {
        const folder = tmpBloc({
            "BlocEditor.ts": `
                import { Editor } from "@bernouy/cms-control/editor";
                export class ParagraphEditor extends Editor {}
            `,
            "default.html": `<p>Text</p>`,
        });
        const bloc: DevBloc = {
            folder,
            manifest: {
                editor: "./BlocEditor.ts",
                "default-tag": "p",
                defaultContent: "./default.html",
            },
            tag: "p",
            label: "Paragraph",
            group: "Text",
            description: "Native paragraph",
            internal: false,
            ownership: { kind: "code-managed" },
            editorEntry: join(folder, "BlocEditor.ts"),
        };

        const built = await buildDevBloc(bloc);

        expect(built.viewJS).toBe("");
        expect(built.editorJS).toContain(`tag: props?.tag ?? "p"`);
        expect(built.editorJS).toContain(`defaultContent: props?.defaultContent ?? "<p>Text</p>"`);
        expect(built.editorJS).not.toContain(`customElements.define("p"`);
    });
});
