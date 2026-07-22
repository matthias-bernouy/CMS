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
});
