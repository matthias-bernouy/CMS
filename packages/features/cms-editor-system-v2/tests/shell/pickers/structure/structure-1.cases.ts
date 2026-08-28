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
    test("structure tree opens media-only slots directly without block picker", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class AlbumEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Images",
                        slot: "images",
                        accepts: [{ kind: "media" as const, accept: ["image" as const] }],
                    },
                ];
            }
        }

        const target = document.createElement("p9r-photo-album");
        const editor = new AlbumEditor(target);
        const node: EditorStructureNode = {
            editor,
            target,
            tag: "p9r-photo-album",
            label: "Photo album",
            badges: [],
            children: [],
        };
        const tree = new StructureTree();
        const actions: StructureTreeActionDetail[] = [];
        tree.addEventListener("editor-v2:structure-action", (event) => {
            actions.push((event as CustomEvent<StructureTreeActionDetail>).detail);
        });
        document.body.append(tree);
        tree.setStructure([node], null);

        tree.controller.openPickerOrEmitSingleMedia(
            { action: "add-child", editor },
            tree.controller.childGroups(node),
            node.label,
        );

        expect(actions).toHaveLength(1);
        expect(actions[0]?.action).toBe("add-child");
        expect(actions[0]?.editor).toBe(editor);
        expect(actions[0]?.slot).toBe("images");
        expect(actions[0]?.item?.kind).toBe("media");
        expect(actions[0]?.item?.kind === "media" ? actions[0].item.accept : undefined).toEqual(["image"]);
        expect(tree.shadowRoot!.querySelector("cms-editor-v2-block-picker-modal")).toBeNull();
    });

    test("replace picker allows replacing the only child in a max-one slot", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class ContainerEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Content",
                        max: 1,
                        accepts: [{ kind: "any-component" as const }],
                    },
                ];
            }
        }

        class ChildEditor extends Editor {}

        const parentTarget = document.createElement("demo-container");
        const childTarget = document.createElement("demo-child");
        const parentEditor = new ContainerEditor(parentTarget);
        const childEditor = new ChildEditor(childTarget);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: childTarget,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        const parentNode: EditorStructureNode = {
            editor: parentEditor,
            target: parentTarget,
            tag: "demo-container",
            label: "Container",
            badges: [],
            children: [childNode],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setCatalog([
            {
                tag: "demo-child",
                label: "Replacement",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: ChildEditor,
            },
        ]);
        tree.setStructure([parentNode], null);

        const groups = tree.controller.replaceGroups(childNode);

        expect(groups[0]!.disabledReason).toBeUndefined();
        expect(groups[0]!.options.map((option) => option.entry?.tag)).toContain("demo-child");
    });
});
