import {
    CMS_BINDING_ATTRIBUTES,
    Editor,
    describe,
    expect,
    installDom,
    parseHTML,
    shellParts,
    shellState,
    test,
} from "../../support/shellTestSupport";
import {
    INLINE_TEXT_ACTIVE_ATTRIBUTE,
    INLINE_TEXT_EDITABLE_ATTRIBUTE,
} from "../../../../src/components/Layout/Shell/Domain/Settings/inlineTextEditing";

describe("Shell", () => {
    test("edits declared plain text directly in the editor frame", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");

        class PlainTextEditor extends Editor {
            protected override textCapability() {
                return { format: "text" as const };
            }
        }

        const editorDom = parseHTML(`
            <!doctype html><html><head></head><body>
                <div data-cms-editor-root><main data-cms-content><p>Original</p></main></div>
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
                editor: PlainTextEditor,
            },
        ]);
        shellParts(shell).commands.bindFrameDocument(frameDocument);
        shellParts(shell).commands.bindViewFrameDocument(viewDom.document);
        shell.loadDocument({
            root: frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!,
            contentRoot: frameDocument.querySelector<HTMLElement>("[data-cms-content]")!,
        });

        expect(paragraph.hasAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE)).toBe(true);
        paragraph.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        paragraph.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));

        expect(paragraph.getAttribute("contenteditable")).toBe("plaintext-only");
        expect(paragraph.hasAttribute(INLINE_TEXT_ACTIVE_ATTRIBUTE)).toBe(true);
        expect(shellState(shell).runtime?.getSelection()?.editor.target).toBe(paragraph);

        paragraph.textContent = "Updated inline";
        paragraph.dispatchEvent(new Event("input", { bubbles: true }));

        expect(viewDom.document.querySelector("[data-cms-content]")?.textContent).toBe("Updated inline");
        expect(shellParts(shell).commands.getContentHtml()).toBe("<p>Updated inline</p>");

        const enter = new Event("keydown", { bubbles: true, cancelable: true });
        Object.defineProperty(enter, "key", { value: "Enter" });
        paragraph.dispatchEvent(enter);
        expect(enter.defaultPrevented).toBe(true);
        expect(paragraph.hasAttribute("contenteditable")).toBe(false);
    });

    test("edits canonical repeat text inside sources only while in edit mode", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");

        class PlainTextEditor extends Editor {
            protected override textCapability() {
                return { format: "text" as const };
            }
        }

        const { document: frameDocument } = parseHTML(`
            <!doctype html><html><head></head><body>
                <div data-cms-editor-root><main data-cms-content>
                    <article ${CMS_BINDING_ATTRIBUTES.source}="/items as items">
                        <p ${CMS_BINDING_ATTRIBUTES.repeat}="items as item">Product: {{ item.name }}</p>
                    </article>
                    <h2><span>Nested markup</span></h2>
                </main></div>
            </body></html>
        `);
        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();
        shell.setCatalog([
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: PlainTextEditor,
            },
            {
                tag: "h2",
                label: "Heading",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: PlainTextEditor,
            },
        ]);
        shellParts(shell).commands.bindFrameDocument(frameDocument);
        shell.loadDocument({
            root: frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!,
            contentRoot: frameDocument.querySelector<HTMLElement>("[data-cms-content]")!,
        });

        const repeated = frameDocument.querySelector<HTMLElement>("p")!;
        const nested = frameDocument.querySelector<HTMLElement>("h2")!;
        expect(repeated.getAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE)).toBe("text");
        expect(nested.hasAttribute(INLINE_TEXT_EDITABLE_ATTRIBUTE)).toBe(false);

        repeated.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        repeated.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
        expect(repeated.getAttribute("contenteditable")).toBe("plaintext-only");

        repeated.textContent = "Item: {{ item.title }}";
        repeated.dispatchEvent(new Event("input", { bubbles: true }));
        expect(shellParts(shell).commands.getContentHtml()).toContain(
            `${CMS_BINDING_ATTRIBUTES.repeat}="items as item">Item: {{ item.title }}</p>`,
        );

        shell.setEditorMode("view");
        expect(repeated.hasAttribute("contenteditable")).toBe(false);
        repeated.dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
        repeated.dispatchEvent(new Event("click", { bubbles: true, cancelable: true }));
        expect(repeated.hasAttribute("contenteditable")).toBe(false);
    });
});
