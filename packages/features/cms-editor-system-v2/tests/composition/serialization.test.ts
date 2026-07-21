import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import {
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
} from "@bernouy/components/base";
import { serializableContentHtml } from "../../src/components/Layout/Shell/Domain/Structure/structureDocument";
import { syncViewFrameContent } from "../../src/components/Layout/Shell/Domain/shellBindingPreview";

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

    test("syncs canonical input without accumulating runtime output", () => {
        const source = editorDocument();
        const target = parseHTML(`<main data-cms-content></main>`).document;

        syncViewFrameContent(source, target, "loading");
        syncViewFrameContent(source, target, "loading");

        const content = target.querySelector("[data-cms-content]")!.innerHTML;
        expect(content).toContain("data-authored");
        expect(content).not.toContain(COMPOSITION_RUNTIME_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_INPUT_ATTRIBUTE);
        expect(content).not.toContain("data-generated");
    });
});
