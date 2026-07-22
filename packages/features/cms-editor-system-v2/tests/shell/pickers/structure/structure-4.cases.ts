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
    test("structure tree removes source from the source picker", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor {}

        const target = document.createElement("demo-card");
        target.setAttribute("cms-source", "/api/plans");
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
        document.body.append(tree);
        tree.setDataSources([
            {
                label: "Plans",
                url: "/api/plans",
                method: "GET",
                fields: [{ path: "items", type: "array" }],
            },
        ]);
        tree.setStructure([node], editor);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        expect(tree.controller.sourceActionLabel(node)).toBe("Update source");

        tree.controller.openSourcePicker(node);

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".remove-source")!.click();

        expect(detail?.action).toBe("remove-source");
        expect(detail?.editor).toBe(editor);
    });

    test("structure tree pre-fills source picker from an existing cms-source binding", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        class CardEditor extends Editor {}

        const target = document.createElement("demo-card");
        target.setAttribute("cms-source", "/api/plans?q=#{address}&limit=5 as plans");
        target.setAttribute("cms-source-trigger", "submit");
        const editor = new CardEditor(target);
        const node: EditorStructureNode = {
            editor,
            target,
            tag: "demo-card",
            label: "Card",
            badges: ["Source"],
            children: [],
        };
        const tree = new StructureTree();
        document.body.append(tree);
        tree.setDataSources([
            {
                label: "Other",
                url: "/api/other",
                method: "GET",
                fields: [],
            },
            {
                label: "Plans",
                url: "/api/plans",
                method: "GET",
                fields: [{ path: "items", type: "array" }],
                params: [
                    { name: "q", in: "query", required: true, type: "string" },
                    { name: "limit", in: "query", type: "number" },
                ],
            },
        ]);
        tree.setStructure([node], editor);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        tree.controller.openSourcePicker(node);

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        expect(picker.shadowRoot!.querySelector<HTMLInputElement>(".source-alias")!.value).toBe("plans");
        expect(picker.shadowRoot!.querySelector<HTMLSelectElement>(".source-trigger")!.selectedIndex).toBe(1);

        const rows = Array.from(picker.shadowRoot!.querySelectorAll<HTMLElement>(".param-row"));
        const qRow = rows.find((row) => row.dataset.paramName === "q")!;
        const limitRow = rows.find((row) => row.dataset.paramName === "limit")!;
        expect(qRow.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex).toBe(0);
        expect(qRow.querySelector<HTMLInputElement>(".param-value")!.value).toBe("address");
        expect(limitRow.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex).toBe(1);
        expect(limitRow.querySelector<HTMLInputElement>(".param-value")!.value).toBe("5");

        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail?.action).toBe("set-source");
        expect(detail?.dataSource?.url).toBe("/api/plans");
        expect(detail?.sourceBinding).toEqual({
            url: "/api/plans",
            alias: "plans",
            trigger: "submit",
            method: "GET",
            params: {
                q: { from: "queryParam", name: "address" },
                limit: { from: "raw", value: "5" },
            },
        });
    });
});
