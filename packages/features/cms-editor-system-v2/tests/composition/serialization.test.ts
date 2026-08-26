import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    COMPOSITION_AUTHORED_ATTRIBUTE,
} from "@bernouy/components/base";
import { serializableContentHtml } from "../../src/components/Layout/Shell/Domain/Structure/structureDocument";
import { syncViewFrameContent } from "../../src/components/Layout/Shell/Domain/Bindings/shellBindingPreview";

function editorDocument() {
    return parseHTML(`
        <main data-cms-content>
            <site-header ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                <template ${COMPOSITION_INPUT_ATTRIBUTE}>
                    <span data-authored cms-ready>Authored input</span>
                </template>
                <p9r-composition-output ${COMPOSITION_OUTPUT_ATTRIBUTE}>
                    <nav data-generated>Generated header</nav>
                </p9r-composition-output>
            </site-header>
        </main>
    `).document;
}

describe("composition serialization", () => {
    test("serializes authored input instead of generated Light DOM", () => {
        const document = editorDocument();
        const content = serializableContentHtml(document.querySelector<HTMLElement>("[data-cms-content]"));

        expect(content).toContain(`<span data-authored="">Authored input</span>`);
        expect(content).not.toContain(COMPOSITION_RUNTIME_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_INPUT_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_OUTPUT_ATTRIBUTE);
        expect(content).not.toContain("data-generated");
        expect(content).not.toContain("cms-ready");
    });

    test("syncs expanded Light DOM without accumulating editor runtime output", () => {
        const source = editorDocument();
        const target = parseHTML(`<main data-cms-content></main>`).document;

        syncViewFrameContent(source, target, "loading", false);
        syncViewFrameContent(source, target, "loading", false);

        const content = target.querySelector("[data-cms-content]")!.innerHTML;
        expect(content).toContain("data-generated");
        expect(content).not.toContain("data-authored");
        expect(content).not.toContain(COMPOSITION_RUNTIME_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_INPUT_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_OUTPUT_ATTRIBUTE);
    });

    test("serializes edited projected children instead of their initial snapshot", () => {
        const document = parseHTML(`
            <main data-cms-content>
                <site-layout ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                    <template ${COMPOSITION_INPUT_ATTRIBUTE}><h1 slot="content">Initial</h1></template>
                    <p9r-composition-output ${COMPOSITION_OUTPUT_ATTRIBUTE}>
                        <header>Private header</header>
                        <!--p9r-composition-slot-start:content-->
                        <h1 ${COMPOSITION_AUTHORED_ATTRIBUTE}="content">Edited</h1>
                        <!--p9r-composition-slot-end:content-->
                    </p9r-composition-output>
                </site-layout>
            </main>
        `).document;

        const content = serializableContentHtml(document.querySelector<HTMLElement>("[data-cms-content]"));

        expect(content).toContain('<h1 slot="content">Edited</h1>');
        expect(content).not.toContain("Initial");
        expect(content).not.toContain("Private header");
        expect(content).not.toContain(COMPOSITION_AUTHORED_ATTRIBUTE);
    });

    test("keeps dynamic image sources inert while syncing the preview", () => {
        const source = parseHTML(`
            <main data-cms-content>
                <img data-kind="dynamic" src="/media/{{ product.image }}.jpg">
                <img data-kind="static" src="/media/static.jpg">
            </main>
        `).document;
        const target = parseHTML(`<main data-cms-content></main>`).document;

        syncViewFrameContent(source, target, "loading", false);

        const dynamicImage = target.querySelector('[data-kind="dynamic"]');
        const staticImage = target.querySelector('[data-kind="static"]');
        expect(dynamicImage?.getAttribute("src")).toBeNull();
        expect(dynamicImage?.getAttribute("data-cms-src")).toBe("/media/{{ product.image }}.jpg");
        expect(staticImage?.getAttribute("src")).toBe("/media/static.jpg");
        expect(staticImage?.getAttribute("data-cms-src")).toBeNull();
    });

    test("restores authored image sources when serializing editor content", () => {
        const document = parseHTML(`
            <main data-cms-content>
                <img data-kind="dynamic" data-cms-src="/media/{{ product.image }}.jpg">
            </main>
        `).document;

        const content = serializableContentHtml(document.querySelector<HTMLElement>("[data-cms-content]"));
        const serialized = parseHTML(`<main>${content}</main>`).document.querySelector('[data-kind="dynamic"]');

        expect(serialized?.getAttribute("src")).toBe("/media/{{ product.image }}.jpg");
        expect(serialized?.getAttribute("data-cms-src")).toBeNull();
    });
});
