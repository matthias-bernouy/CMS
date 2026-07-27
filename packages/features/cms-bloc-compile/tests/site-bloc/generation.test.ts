import { describe, expect, test } from "bun:test";
import { generateSiteBlocSourceBundle } from "@bernouy/cms-bloc-compile";
import { definition, publishedSnapshot } from "./fixtures";
import { expectedBuilderJson, expectedEditorSource } from "./generatedSourceFixtures";

describe("generateSiteBlocSourceBundle", () => {
    test("generates the exact six conventional source files", () => {
        const source = generateSiteBlocSourceBundle(definition());

        expect(Object.keys(source)).toEqual([
            "manifest.json",
            "Bloc.ts",
            "BlocEditor.ts",
            "template.html",
            "default.html",
            "builder.json",
        ]);
        expect(source["manifest.json"]).toBe(`{
    "default-tag": "site-hero",
    "bloc": "./Bloc.ts",
    "editor": "./BlocEditor.ts",
    "defaultContent": "./default.html",
    "meta": {
        "title": "Hero",
        "description": "Reusable hero"
    }
}
`);
        expect(source["Bloc.ts"]).toBe(`import { Component } from "@bernouy/components/base";
import template from "./template.html" with { type: "text" };

const css = ":host { display: block; }";

export class SiteCompositeBloc extends Component {
    constructor() {
        super({ css, template });
    }
}

customElements.define("BE5_TAG_TO_BE_REPLACED", SiteCompositeBloc);
`);
        expect(source["template.html"]).toBe(
            '<basic-container aria-label="A &quot;&lt;&amp;" width="wide"><slot name="title"></slot><slot></slot></basic-container>\n',
        );
        expect(source["default.html"]).toBe('<site-hero><h1 slot="title">Hello</h1><p>Body</p></site-hero>\n');
        expect(source["BlocEditor.ts"]).toBe(expectedEditorSource);
        expect(source["builder.json"]).toBe(expectedBuilderJson);
        for (const content of Object.values(source)) {
            expect(content.includes("\r")).toBe(false);
            expect(content.endsWith("\n")).toBe(true);
        }
    });

    test("canonicalizes map and set-like order while preserving node and slot order", () => {
        const reordered = structuredClone(publishedSnapshot);
        const root = reordered.structure[0];
        if (!root || root.kind !== "bloc") {
            throw new Error("Expected fixture root bloc");
        }
        root.attributes = { "aria-label": 'A "<&', width: "wide" };
        reordered.dependencies.reverse();
        reordered.slots[0]!.accepts.reverse();
        const first = generateSiteBlocSourceBundle(definition());
        const second = generateSiteBlocSourceBundle(definition({ draft: reordered, published: reordered }));
        expect(second).toEqual(first);

        const slotOrderChanged = structuredClone(publishedSnapshot);
        slotOrderChanged.slots.reverse();
        expect(generateSiteBlocSourceBundle(definition(), slotOrderChanged)["BlocEditor.ts"]).not.toBe(
            first["BlocEditor.ts"],
        );

        const nodeOrderChanged = structuredClone(publishedSnapshot);
        const changedRoot = nodeOrderChanged.structure[0];
        if (!changedRoot || changedRoot.kind !== "bloc") {
            throw new Error("Expected fixture root bloc");
        }
        changedRoot.children.reverse();
        expect(generateSiteBlocSourceBundle(definition(), nodeOrderChanged)["template.html"]).not.toBe(
            first["template.html"],
        );
    });

    test("uses an explicit snapshot for preview without rewriting builder.json", () => {
        const unpublished = definition({ published: null, publishedRevision: null });
        const preview = { ...publishedSnapshot, name: "Draft hero" };
        const source = generateSiteBlocSourceBundle(unpublished, preview);
        expect(source["manifest.json"]).toContain('"title": "Draft hero"');
        expect(source["builder.json"]).toContain('"published": null');
        expect(() => generateSiteBlocSourceBundle(unpublished)).toThrow("has no published snapshot");
    });
});
