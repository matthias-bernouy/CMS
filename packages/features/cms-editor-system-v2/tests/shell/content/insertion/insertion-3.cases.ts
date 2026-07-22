import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    Editor,
    applyParamSyncSetting,
    defineTextControls,
    describe,
    dynamicDataScopes,
    expect,
    installDom,
    openDynamicDataPicker,
    paramSyncSettings,
    parseHTML,
    setShellFrameDocument,
    setShellViewFrameDocument,
    shellParts,
    shellState,
    test,
    type BlockPickerSelectDetail,
    type DataScope,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorStructureNode,
    type StructureTreeActionDetail,
    type TopBarSourceStateChangeDetail,
    type TopBarViewportChangeDetail,
} from "../../support/shellTestSupport";

describe("Shell", () => {
    test("keeps default content block root as the structure parent", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class FigureEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Image",
                        slot: "image",
                        max: 1,
                        accepts: [{ kind: "any-component" as const }],
                    },
                    {
                        label: "Caption",
                        slot: "caption",
                        max: 1,
                        accepts: [{ kind: "any-component" as const }],
                    },
                ];
            }
        }

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        root.setAttribute("data-cms-editor-root", "");
        const contentRoot = frameDocument.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            setInsertItems?: (_items: unknown[]) => void;
            setStructure?: () => void;
        };
        structureTree.setInsertItems = () => undefined;
        structureTree.setStructure = () => undefined;
        shell.setCatalog([
            {
                tag: "demo-figure",
                label: "Figure",
                defaultContent: `<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: FigureEditor,
            },
            {
                tag: "img",
                label: "Image",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: Editor,
            },
            {
                tag: "p",
                label: "Paragraph",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: Editor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        shellParts(shell).mutations.addRoot({
            kind: "block",
            entry: {
                tag: "demo-figure",
                label: "Figure",
                defaultContent: `<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`,
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: FigureEditor,
            },
        });

        const runtime = shellState(shell).runtime!;
        const structure = runtime.getStructure();

        expect(contentRoot.innerHTML).toBe(
            `<demo-figure><img slot="image" alt=""><p slot="caption">Caption</p></demo-figure>`,
        );
        expect(structure.map((node) => node.label)).toEqual(["Figure"]);
        expect(structure[0]?.children.map((node) => node.label)).toEqual(["Image", "Paragraph"]);
    });

    test("ignores native rich text input events without a value detail", async () => {
        installDom();

        const { SETTINGS_VIEW_CONTENT_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );
        if (!customElements.get("cms-editor-v2-rich-text-editor")) {
            customElements.define("cms-editor-v2-rich-text-editor", class extends HTMLElement {});
        }

        const view = new SettingsView();
        const events: string[] = [];
        view.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<{ value: string }>).detail.value);
        });

        view.setSettings(
            [],
            {
                format: "richtext",
                bold: true,
            },
            "Initial",
        );

        const control = view.shadowRoot!.querySelector("cms-editor-v2-rich-text-editor")!;

        control.dispatchEvent(
            new Event("input", {
                bubbles: true,
                composed: true,
            }),
        );
        control.dispatchEvent(
            new CustomEvent("input", {
                bubbles: true,
                composed: true,
                detail: { value: "Updated" },
            }),
        );

        expect(events).toEqual(["Updated"]);
    });
});
