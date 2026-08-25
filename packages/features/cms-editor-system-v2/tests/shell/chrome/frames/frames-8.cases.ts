import { Editor, describe, expect, installDom, parseHTML, shellParts, test } from "../../support/shellTestSupport";
import {
    INLINE_TEXT_ACTIVE_ATTRIBUTE,
    INLINE_TEXT_EDITABLE_ATTRIBUTE,
} from "../../../../src/components/Layout/Shell/Domain/Settings/inlineTextEditing";

describe("Shell", () => {
    test("edits rich text in the frame with capability-limited formatting tools", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");

        class RichTextEditor extends Editor {
            protected override textCapability() {
                return {
                    format: "richtext" as const,
                    bold: true,
                    italic: true,
                    underline: true,
                    link: true,
                    dynamic: true,
                    size: true,
                };
            }
        }

        const editorDom = parseHTML(`
            <!doctype html><html><head></head><body>
                <div data-cms-editor-root><main data-cms-content>
                    <p cms-repeat="$range(2) as index">Hello <em>world {{ index }}</em></p>
                </main></div>
            </body></html>
        `);
        const viewDom = parseHTML(`
            <!doctype html><html><head></head><body>
                <div data-cms-editor-root><main data-cms-content></main></div>
            </body></html>
        `);
        const frameDocument = editorDom.document;
        const paragraph = frameDocument.querySelector<HTMLElement>("p")!;
        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shell.setCatalog([
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: RichTextEditor,
            },
        ]);
        shellParts(shell).commands.bindFrameDocument(frameDocument);
        shellParts(shell).commands.bindViewFrameDocument(viewDom.document);
        shell.loadDocument({
            root: frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!,
            contentRoot: frameDocument.querySelector<HTMLElement>("[data-cms-content]")!,
        });

        expect(paragraph.getAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE)).toBe("richtext");
        paragraph.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        paragraph.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

        expect(paragraph.getAttribute("contenteditable")).toBe("true");
        expect(paragraph.hasAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE)).toBe(true);
        expect(paragraph.querySelector("em")?.textContent).toBe("world {{ index }}");

        const chrome = shell.shadowRoot!.querySelector<HTMLElement>(".inline-rich-text-chrome")!;
        const titles = Array.from(chrome.querySelectorAll<HTMLButtonElement>(".tool"), (button) => button.title);
        expect(chrome.hidden).toBe(false);
        expect(titles).toEqual([
            "Decrease text size",
            "Increase text size",
            "Bold",
            "Italic",
            "Underline",
            "Link",
            "Dynamic data",
        ]);

        paragraph.innerHTML = "<strong>Hello {{ index }}</strong> <em>edited</em>";
        paragraph.dispatchEvent(new Event("input", { bubbles: true }));
        expect(viewDom.document.querySelector("strong")?.textContent).toBe("Hello {{ index }}");
        expect(viewDom.document.querySelector("em")?.textContent).toBe("edited");

        const enter = new Event("keydown", { bubbles: true, cancelable: true });
        Object.defineProperty(enter, "key", { value: "Enter" });
        paragraph.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(false);
        expect(paragraph.getAttribute("contenteditable")).toBe("true");

        chrome
            .querySelector<HTMLButtonElement>('[title="Dynamic data"]')!
            .dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        expect(chrome.querySelector<HTMLElement>(".inline-rich-text-data-picker")!.hidden).toBe(false);
        paragraph.dispatchEvent(new Event("focusout", { bubbles: true }));
        expect(paragraph.getAttribute("contenteditable")).toBe("true");

        const serialized = shellParts(shell).commands.getContentHtml();
        expect(serialized).toContain("<strong>Hello {{ index }}</strong>");
        expect(serialized).not.toContain("data-cms-editor-v2-inline-text");
        expect(serialized).not.toContain("contenteditable");
    });
});
