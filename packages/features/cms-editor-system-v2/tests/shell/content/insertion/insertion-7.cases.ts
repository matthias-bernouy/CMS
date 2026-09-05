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
import { createNativeEditorCatalog } from "../../../../src/native/catalog";

describe("Shell native root placement", () => {
    test("rejects pasting or moving a contextual native editor to the page root", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        class HostEditor extends Editor {
            protected override contentSlots() {
                return [{ label: "Label", slot: "label", accepts: [{ kind: "component" as const, tag: "span" }] }];
            }
        }
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root>
                <div data-cms-content>
                    <demo-host id="host"><span id="contextual" slot="label">Label</span></demo-host>
                    <h1 id="root-target">Title</h1>
                </div>
            </div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-host",
                label: "Host",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: HostEditor,
            },
            ...createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor),
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const contextual = runtime.getEditor(contentRoot.querySelector<HTMLElement>("#contextual")!)!;
        const rootTarget = runtime.getEditor(contentRoot.querySelector<HTMLElement>("#root-target")!)!;

        shellParts(shell).mutations.handleStructureAction({ action: "copy", editor: contextual });
        shellParts(shell).mutations.handleStructureAction({ action: "paste-after" });
        shellParts(shell).mutations.handleStructureAction({ action: "paste-after", editor: rootTarget });
        expect(contentRoot.querySelectorAll("#contextual")).toHaveLength(1);

        shellParts(shell).mutations.handleStructureAction({
            action: "move-after",
            editor: rootTarget,
            sourceEditor: contextual,
        });
        expect(contextual.target.parentElement?.id).toBe("host");
    });

    test("revalidates every element produced by forged block default content", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        class HostEditor extends Editor {
            protected override contentSlots() {
                return [{ label: "Content", accepts: [{ kind: "any-component" as const }] }];
            }
        }
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root>
                <div data-cms-content>
                    <demo-host id="host"><p>Existing</p></demo-host>
                    <h1 id="root-target">Title</h1>
                </div>
            </div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const cardEntry = {
            tag: "demo-card",
            label: "Card",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: Editor,
        };
        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog([
            {
                tag: "demo-host",
                label: "Host",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: HostEditor,
            },
            cardEntry,
            ...createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor),
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const host = runtime.getEditor(contentRoot.querySelector<HTMLElement>("#host")!)!;
        const rootTarget = runtime.getEditor(contentRoot.querySelector<HTMLElement>("#root-target")!)!;
        const forgedRoot = {
            ...cardEntry,
            defaultContent: "<demo-card></demo-card><span>Contextual bypass</span>",
        };
        const forgedChild = {
            ...cardEntry,
            defaultContent: "<demo-card></demo-card><li>List bypass</li>",
        };
        const forgedNested = {
            ...cardEntry,
            tag: "section",
            defaultContent: "<section><ul><p>Nested bypass</p></ul></section>",
        };
        const forgedComponentNested = {
            ...cardEntry,
            defaultContent: "<demo-card><ul><demo-card>Nested bypass</demo-card></ul></demo-card>",
        };
        const forgedFormOverride = {
            ...cardEntry,
            defaultContent: `<demo-card><form><button formaction="https://example.invalid/steal">
                Submit
            </button></form></demo-card>`,
        };

        shellParts(shell).mutations.addRoot({ kind: "block", entry: forgedRoot });
        shellParts(shell).mutations.addChild(host, { kind: "block", entry: forgedChild });
        shellParts(shell).mutations.replaceEditor(rootTarget, { kind: "block", entry: forgedRoot });
        shellParts(shell).mutations.addRoot({ kind: "block", entry: forgedNested });
        shellParts(shell).mutations.addRoot({ kind: "block", entry: forgedComponentNested });
        shellParts(shell).mutations.addRoot({ kind: "block", entry: forgedFormOverride });

        expect(contentRoot.querySelectorAll("demo-card")).toHaveLength(0);
        expect(contentRoot.querySelectorAll("span")).toHaveLength(0);
        expect(contentRoot.querySelectorAll("li")).toHaveLength(0);
        expect(contentRoot.querySelectorAll("section")).toHaveLength(0);
        expect(contentRoot.querySelector("#root-target")?.textContent).toBe("Title");
        expect(contentRoot.querySelector("#host")?.textContent).toBe("Existing");
    });
});
