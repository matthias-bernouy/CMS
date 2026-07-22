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
    test("structure tree condition modal emits generic field conditions", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");
        class SourceEditor extends Editor {
            protected override dataScopes(): DataScope[] {
                return [{ name: "plan", label: "Plan", fields: [{ path: "status", type: "string" }] }];
            }
        }
        class ChildEditor extends Editor {}
        const source = document.createElement("demo-source");
        const child = document.createElement("demo-child");
        source.append(child);
        const sourceNode: EditorStructureNode = {
            editor: new SourceEditor(source),
            target: source,
            tag: "demo-source",
            label: "Source",
            badges: [],
            children: [],
        };
        const childNode: EditorStructureNode = {
            editor: new ChildEditor(child),
            target: child,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        sourceNode.children = [childNode];
        const tree = new StructureTree();
        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });
        document.body.append(tree);
        tree.setStructure([sourceNode], null);

        tree.controller.menus.openContextMenu(childNode, 0, 0);
        Array.from(tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item"))
            .find((button) => button.textContent === "Add condition")!
            .click();
        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-condition-picker")!;
        Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".mode"))
            .find((button) => button.textContent === "Data field")!
            .click();
        picker.shadowRoot!.querySelector<HTMLSelectElement>(".field-operator")!.selectedIndex = 2;
        picker.shadowRoot!.querySelector<HTMLSelectElement>(".field-operator")!.dispatchEvent(new Event("change"));
        const valueInput = picker.shadowRoot!.querySelector<HTMLInputElement>(".field-value")!;
        valueInput.value = "active";
        valueInput.dispatchEvent(new Event("input"));
        expect(picker.shadowRoot!.querySelector<HTMLInputElement>(".field-value")).toBe(valueInput);
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".apply")!.click();

        expect(detail?.action).toBe("set-condition");
        expect(detail?.conditionExpression).toBe('plan.status == "active"');
    });

    test("structure tree expands collapsed parents to reveal selected children", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor extends Editor {}

        const parentTarget = document.createElement("demo-parent");
        const childTarget = document.createElement("demo-child");
        const parentEditor = new DemoEditor(parentTarget);
        const childEditor = new DemoEditor(childTarget);
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
            tag: "demo-parent",
            label: "Parent",
            badges: [],
            children: [childNode],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setStructure([parentNode], null);
        tree.shadowRoot!.querySelector<HTMLButtonElement>(".toggle")!.click();

        expect(Array.from(tree.shadowRoot!.querySelectorAll(".label")).map((label) => label.textContent)).not.toContain(
            "Child",
        );

        tree.setStructure([parentNode], childEditor, [], { scrollSelectedIntoView: true });

        expect(Array.from(tree.shadowRoot!.querySelectorAll(".label")).map((label) => label.textContent)).toContain(
            "Child",
        );
    });
});
