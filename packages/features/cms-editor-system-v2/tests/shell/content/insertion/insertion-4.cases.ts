import {
    Editor,
    describe,
    expect,
    installDom,
    parseHTML,
    setShellFrameDocument,
    shellParts,
    shellState,
    test,
} from "../../support/shellTestSupport";
import type { SettingControl } from "@bernouy/cms-content/editor";

describe("Shell editing policy", () => {
    test("rejects forged insertion and binding actions", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        class CardEditor extends Editor {}
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root>
                <main data-cms-content><demo-card>Existing</demo-card></main>
            </div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-card",
                label: "Card",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        ]);
        shell.setEditingPolicy({
            bindings: false,
            canInsertTag: () => false,
        });
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });
        const editor = shellState(shell).runtime?.getEditor(contentRoot.querySelector("demo-card")!);
        if (!editor) {
            throw new Error("Missing card editor.");
        }

        shellParts(shell).mutations.handleStructureAction({
            action: "set-source",
            editor,
            dataSource: { label: "Plans", url: "/plans", fields: [] },
        });
        shellParts(shell).mutations.handleStructureAction({
            action: "add-root",
            item: {
                kind: "block",
                entry: {
                    tag: "demo-new",
                    label: "New",
                    bloc: HTMLElement as unknown as CustomElementConstructor,
                    editor: CardEditor,
                },
            },
        });

        expect(editor.target.hasAttribute("cms-source")).toBe(false);
        expect(contentRoot.innerHTML).toBe("<demo-card>Existing</demo-card>");
    });

    test("filters binding settings and guarded attribute changes", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        const titleSetting: SettingControl = { type: "text", label: "Title", attribute: "title" };
        const sourceSetting: SettingControl = { type: "text", label: "Source", attribute: "cms-source" };
        class CardEditor extends Editor {
            protected override settings() {
                return [{ kind: "self" as const, label: "Card", settings: [titleSetting, sourceSetting] }];
            }
        }
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root><main data-cms-content><demo-card></demo-card></main></div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-card",
                label: "Card",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: CardEditor,
            },
        ]);
        shell.setEditingPolicy({ bindings: false });
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });
        const editor = shellState(shell).runtime?.getEditor(contentRoot.querySelector("demo-card")!);
        if (!editor) {
            throw new Error("Missing card editor.");
        }
        shellParts(shell).commands.select(editor);

        const labels = Array.from(
            shellParts(shell).refs.settings.shadowRoot!.querySelectorAll("cms-editor-v2-text-input"),
        ).map((control) => control.getAttribute("label"));
        expect(labels).toContain("Title");
        expect(labels).not.toContain("Source");
        shellParts(shell).commands.applySetting(editor, sourceSetting, "/plans");
        shellParts(shell).commands.applySetting(editor, titleSetting, "Card", {
            title: "Card",
            "cms-condition": "{{ plan.active }}",
        });

        expect(editor.target.getAttribute("title")).toBe("Card");
        expect(editor.target.hasAttribute("cms-source")).toBe(false);
        expect(editor.target.hasAttribute("cms-condition")).toBe(false);
    });
});
