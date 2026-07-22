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
    test("structure tree ignores delete shortcuts from shadow editable controls", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor {}

        const target = document.createElement("demo-card");
        const editor = new CardEditor(target);
        const node: EditorStructureNode = {
            editor,
            target,
            tag: "demo-card",
            label: "Card",
            badges: [],
            children: [],
        };
        const tree = new StructureTree();
        const host = document.createElement("cms-editor-shell");
        const shadow = host.attachShadow({ mode: "open" });
        const input = document.createElement("input");
        shadow.append(input);
        document.body.append(host, tree);
        tree.setStructure([node], editor);

        const actions: string[] = [];
        tree.addEventListener("editor-v2:structure-action", (event) => {
            actions.push((event as CustomEvent<StructureTreeActionDetail>).detail.action);
        });

        let prevented = false;
        tree.controller.onDocumentKeydown({
            key: "Delete",
            ctrlKey: false,
            metaKey: false,
            target: host,
            preventDefault: () => {
                prevented = true;
            },
            composedPath: () => [input, shadow, host, document],
        } as unknown as KeyboardEvent);

        expect(actions).toEqual([]);
        expect(prevented).toBe(false);
    });
});
