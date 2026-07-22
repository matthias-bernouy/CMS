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
    test("structure tree condition modal lets source status conditions target an outer nested source", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class DemoEditor extends Editor {}

        const outer = document.createElement("demo-outer");
        outer.setAttribute("cms-source", "/api/outer");
        outer.setAttribute("cms-source-id", "outer");
        const inner = document.createElement("demo-inner");
        inner.setAttribute("cms-source", "/api/inner");
        inner.setAttribute("cms-source-id", "inner");
        const child = document.createElement("demo-child");
        inner.append(child);
        outer.append(inner);

        const outerEditor = new DemoEditor(outer);
        const innerEditor = new DemoEditor(inner);
        const childEditor = new DemoEditor(child);
        const childNode: EditorStructureNode = {
            editor: childEditor,
            target: child,
            tag: "demo-child",
            label: "Child",
            badges: [],
            children: [],
        };
        const innerNode: EditorStructureNode = {
            editor: innerEditor,
            target: inner,
            tag: "demo-inner",
            label: "Inner source",
            badges: ["Source"],
            children: [childNode],
        };
        const outerNode: EditorStructureNode = {
            editor: outerEditor,
            target: outer,
            tag: "demo-outer",
            label: "Outer source",
            badges: ["Source"],
            children: [innerNode],
        };
        const tree = new StructureTree();
        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });
        document.body.append(tree);
        tree.setStructure([outerNode], null);

        tree.controller.menus.openContextMenu(childNode, 0, 0);
        tree.shadowRoot!.querySelectorAll<HTMLButtonElement>(".context-item").forEach((button) => {
            if (button.textContent === "Add condition") {
                button.click();
            }
        });

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-condition-picker")!;
        expect(
            Array.from(picker.shadowRoot!.querySelectorAll(".source-title")).map((title) => title.textContent),
        ).toEqual(["Inner source", "Outer source"]);

        const sources = Array.from(picker.shadowRoot!.querySelectorAll<HTMLElement>(".source"));
        const outerSource = sources.find(
            (source) => source.querySelector(".source-title")?.textContent === "Outer source",
        )!;
        const outerError = Array.from(outerSource.querySelectorAll("label"))
            .find((label) => label.textContent === "error")!
            .querySelector<HTMLInputElement>("input")!;
        outerError.checked = true;
        outerError.dispatchEvent(new Event("change"));
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".apply")!.click();

        expect(detail?.action).toBe("set-source-status-conditions");
        expect(detail?.editor).toBe(childEditor);
        expect(detail?.sourceConditions).toEqual([{ sourceEditor: outerEditor, sourceState: "error" }]);
    });
});
