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
    test("structure tree condition modal hides nested source status conditions for the same source", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor extends Editor {}

        const sourceTarget = document.createElement("demo-source");
        sourceTarget.setAttribute("cms-source", "/api/plans");
        const wrapperTarget = document.createElement("demo-wrapper");
        const childTarget = document.createElement("demo-child");
        wrapperTarget.setAttribute(CMS_BINDING_ATTRIBUTES.condition, "$source.loading");
        wrapperTarget.append(childTarget);
        sourceTarget.append(wrapperTarget);
        const sourceEditor = new DemoEditor(sourceTarget);
        const wrapperEditor = new DemoEditor(wrapperTarget);
        const childEditor = new DemoEditor(childTarget);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: childTarget,
            tag: "demo-child",
            label: "State child",
            badges: [],
            children: [],
        };
        const wrapperNode: EditorStructureNode = {
            editor: wrapperEditor,
            target: wrapperTarget,
            tag: "demo-wrapper",
            label: "Wrapper",
            badges: ["loading"],
            children: [childNode],
        };
        const sourceNode: EditorStructureNode = {
            editor: sourceEditor,
            target: sourceTarget,
            tag: "demo-source",
            label: "Source",
            badges: [],
            children: [wrapperNode],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setStructure([sourceNode], null);

        tree.controller.menus.openContextMenu(childNode, 0, 0);
        tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item").forEach((button) => {
            if (button.textContent === "Add condition") {
                button.click();
            }
        });

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-condition-picker")!;
        expect(picker.shadowRoot!.querySelector(".empty")?.textContent).toBe("No source available.");
        expect(picker.shadowRoot!.querySelector<HTMLButtonElement>(".apply")!.disabled).toBe(true);
    });

    test("structure tree only scrolls selected rows when requested", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor {
            constructor(readonly target: HTMLElement) {}
            getContentSlots() {
                return [];
            }
        }

        const target = document.createElement("demo-bloc");
        const editor = new DemoEditor(target) as unknown as Editor;
        const node: EditorStructureNode = {
            editor,
            target,
            tag: "demo-bloc",
            label: "Demo",
            badges: [],
            children: [],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.connectedCallback();

        tree.scrollTop = 120;
        tree.setStructure([node], editor);
        expect(tree.scrollTop).toBe(120);

        let didScroll = false;
        tree.scrollTo = () => {
            didScroll = true;
        };
        tree.setStructure([node], editor, [], { scrollSelectedIntoView: true });
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(didScroll).toBe(true);
    });
});
