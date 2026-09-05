import { describe, expect, test } from "bun:test";
import { parseIntegrationDefinition } from "@bernouy/cms-integrations";

describe("@bernouy/cms-integrations bloc artifact parsing", () => {
    test("preserves bloc executable sources while normalizing metadata", () => {
        const viewJS = "  customElements.define('demo-card', class extends HTMLElement {});\n";
        const editorJS = "// Native editor behavior is provided by the browser.";
        const definition = parseIntegrationDefinition({
            kind: "bloc-pack",
            label: "Bloc pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "  demo-card  ",
                        name: "  Demo card  ",
                        group: "  Demo  ",
                        viewJS,
                        editorJS,
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toEqual({
            type: "bloc",
            bloc: {
                tag: "demo-card",
                name: "Demo card",
                group: "Demo",
                viewJS,
                editorJS,
            },
        });
    });

    test("parses a supported managed native element", () => {
        const definition = parseIntegrationDefinition({
            kind: "link-pack",
            label: "Link pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "demo-link",
                        name: "Demo link",
                        nativeElement: "A",
                        viewJS: "customElements.define('demo-link', class extends HTMLElement {});",
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toHaveProperty("bloc.nativeElement", "a");
    });

    test("rejects native containers that require their own slot contract", () => {
        expect(() =>
            parseIntegrationDefinition({
                kind: "form-pack",
                label: "Form pack",
                inputs: [],
                artifacts: [
                    {
                        type: "bloc",
                        bloc: {
                            tag: "demo-form",
                            name: "Demo form",
                            nativeElement: "form",
                            viewJS: "customElements.define('demo-form', class extends HTMLElement {});",
                        },
                    },
                ],
            }),
        ).toThrow(/unsupported managed native element "form"/);
    });

    test("omits a whitespace-only view source while preserving a null editor source", () => {
        const definition = parseIntegrationDefinition({
            kind: "native-bloc-pack",
            label: "Native bloc pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "native-image",
                        name: "Native image",
                        viewJS: "  \n\t",
                        editorJS: null,
                    },
                },
            ],
        });

        expect(definition.artifacts?.[0]).toMatchObject({
            type: "bloc",
            bloc: {
                editorJS: null,
            },
        });
        expect(definition.artifacts?.[0]).not.toHaveProperty("bloc.viewJS");
    });

    test("preserves declarative light-DOM compositions and internal controller metadata", () => {
        const definition = parseIntegrationDefinition({
            kind: "composition-pack",
            label: "Composition pack",
            inputs: [],
            artifacts: [
                {
                    type: "bloc",
                    bloc: {
                        tag: "site-shell",
                        name: "Site shell",
                        path: "blocs/site-shell",
                        composition: "template.html",
                        editor: "BlocEditor.ts",
                    },
                },
                {
                    type: "bloc",
                    bloc: {
                        tag: "site-shell-controller",
                        name: "Site shell controller",
                        internal: true,
                        path: "blocs/site-shell",
                        view: "controller/Bloc.ts",
                        editor: null,
                    },
                },
            ],
        });

        expect(definition.artifacts).toEqual([
            {
                type: "bloc",
                bloc: {
                    tag: "site-shell",
                    name: "Site shell",
                    path: "blocs/site-shell",
                    composition: "template.html",
                    editor: "BlocEditor.ts",
                },
            },
            {
                type: "bloc",
                bloc: {
                    tag: "site-shell-controller",
                    name: "Site shell controller",
                    internal: true,
                    path: "blocs/site-shell",
                    view: "controller/Bloc.ts",
                    editor: null,
                },
            },
        ]);
    });
});
