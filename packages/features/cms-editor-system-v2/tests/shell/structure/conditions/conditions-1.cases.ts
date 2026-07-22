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
    test("structure tree emits source status condition actions from the condition modal", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor extends Editor {}

        const source = document.createElement("demo-source");
        source.setAttribute("cms-source", "/api/plans");
        const child = document.createElement("demo-child");
        source.append(child);
        const sourceEditor = new DemoEditor(source);
        const childEditor = new DemoEditor(child);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: child,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        const sourceNode: EditorStructureNode = {
            editor: sourceEditor,
            target: source,
            tag: "demo-source",
            label: "Source",
            badges: [],
            children: [childNode],
        };
        const tree = new StructureTree();
        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });
        document.body.append(tree);
        tree.setDataSources([{ label: "Plans endpoint", url: "/api/plans", fields: [] }]);
        tree.setStructure([sourceNode], null);

        tree.controller.menus.openContextMenu(childNode, 0, 0);
        const buttons = Array.from(tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item"));
        expect(buttons.filter((button) => button.textContent?.startsWith("Show when"))).toHaveLength(0);
        buttons.find((button) => button.textContent === "Add condition")!.click();

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-condition-picker")!;
        expect(picker.shadowRoot!.querySelector(".source-name")?.textContent).toBe("Source: Plans endpoint");
        const emptyInput = Array.from(picker.shadowRoot!.querySelectorAll("label"))
            .find((label) => label.textContent === "empty")!
            .querySelector<HTMLInputElement>("input")!;
        emptyInput.checked = true;
        emptyInput.dispatchEvent(new Event("change"));
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".apply")!.click();

        expect(detail?.action).toBe("set-source-status-conditions");
        expect(detail?.editor).toBe(childEditor);
        expect(detail?.sourceConditions).toEqual([{ sourceEditor, sourceState: "empty" }]);
    });
});
