import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    Editor,
    EditorCatalog,
} from "@bernouy/cms-content/editor";

function installDom(): void {
    const { document, customElements, HTMLElement, CustomEvent } = parseHTML(`
        <!DOCTYPE html>
        <html>
            <body></body>
        </html>
    `);

    Object.assign(globalThis, {
        document,
        customElements,
        HTMLElement,
        CustomEvent,
    });
}

describe("Shell", () => {
    test("receives the editor catalog", async () => {
        installDom();

        const { Shell } = await import("../src/exports");

        class DemoBloc extends HTMLElement { }
        class DemoEditor {
            constructor(readonly target: HTMLElement) { }
        }

        const catalog: EditorCatalog = [
            {
                tag: "demo-bloc",
                label: "Demo bloc",
                bloc: DemoBloc,
                editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
            },
        ];
        const shell = new Shell();

        shell.setCatalog(catalog);

        expect(shell.catalog).toEqual(catalog);
        expect(shell.getAttribute("catalog-size")).toBe("1");
    });
});
