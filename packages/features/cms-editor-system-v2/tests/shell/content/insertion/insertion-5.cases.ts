import {
    Editor,
    describe,
    expect,
    installDom,
    parseHTML,
    setShellFrameDocument,
    shellParts,
    test,
} from "../../support/shellTestSupport";

describe("Shell root editor slots", () => {
    test("uses contentRoot slots for root picker groups and insertion", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        class HostEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Actions",
                        slot: "actions",
                        max: 1,
                        accepts: [{ kind: "component" as const, tag: "demo-button" }],
                    },
                ];
            }
        }
        class ButtonEditor extends Editor {}
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root><site-card data-cms-content></site-card></div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const shell = new Shell();
        document.body.append(shell);
        const buttonEntry = {
            tag: "demo-button",
            label: "Button",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: ButtonEditor,
        };
        shell.setCatalog([
            {
                tag: "site-card",
                label: "Site card",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: HostEditor,
                insertable: false,
            },
            buttonEntry,
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const groups = shellParts(shell).refs.structureTree.controller.pickers.rootGroups();
        expect(groups.map((group) => ({ label: group.label, slot: group.slot }))).toEqual([
            { label: "Actions", slot: "actions" },
        ]);
        expect(groups[0]?.options.map((option) => option.entry?.tag)).toEqual(["demo-button"]);

        shellParts(shell).mutations.handleStructureAction({
            action: "add-root",
            item: { kind: "block", entry: buttonEntry },
            slot: "actions",
        });

        expect(contentRoot.innerHTML).toBe('<demo-button slot="actions"></demo-button>');
    });
});
