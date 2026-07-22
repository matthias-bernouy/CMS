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
    test("structure tree emits source selection actions from the source picker", async () => {
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
        document.body.append(tree);
        tree.setDataSources([
            {
                label: "Plans",
                url: "/api/plans",
                method: "GET",
                provider: "plans-api",
                providerLabel: "Plans API",
                description: "Available pricing plans.",
                params: [
                    { name: "q", in: "query", required: true, type: "string", description: "Search query." },
                    { name: "limit", in: "query", type: "number" },
                ],
                fields: [{ path: "items", type: "array" }],
            },
            {
                label: "Create plan",
                url: "/api/plans",
                method: "POST",
                provider: "plans-api",
                providerLabel: "Plans API",
                fields: [],
            },
        ]);
        tree.setStructure([node], editor);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        tree.controller.openSourcePicker(node);

        const picker = tree.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        expect(picker.shadowRoot!.querySelector(".source .name")?.textContent).toBe("Plans");
        expect(picker.shadowRoot!.querySelector(".details-eyebrow")?.textContent).toBe("Response fields");
        expect(picker.shadowRoot!.querySelector(".binding .config-heading")?.textContent).toBe("Binding");
        expect(picker.shadowRoot!.querySelector(".source-method")).toBeNull();
        expect(picker.shadowRoot!.textContent ?? "").not.toContain("Create plan");
        const methodFilter = picker.shadowRoot!.querySelector<HTMLSelectElement>(".method-filter")!;
        methodFilter.options[0]!.removeAttribute("selected");
        methodFilter.options[0]!.selected = false;
        methodFilter.options[1]!.selected = true;
        methodFilter.options[1]!.setAttribute("selected", "");
        methodFilter.setAttribute("value", "POST");
        methodFilter.dispatchEvent(new Event("change", { bubbles: true }));
        expect(picker.shadowRoot!.querySelector(".source .name")?.textContent).toBe("Create plan");
        methodFilter.options[1]!.removeAttribute("selected");
        methodFilter.options[1]!.selected = false;
        methodFilter.options[5]!.selected = true;
        methodFilter.options[5]!.setAttribute("selected", "");
        methodFilter.setAttribute("value", "all");
        methodFilter.dispatchEvent(new Event("change", { bubbles: true }));
        expect(
            Array.from(picker.shadowRoot!.querySelectorAll(".source .name")).map((source) => source.textContent),
        ).toEqual(["Plans", "Create plan"]);
        methodFilter.options[5]!.removeAttribute("selected");
        methodFilter.options[5]!.selected = false;
        methodFilter.options[1]!.removeAttribute("selected");
        methodFilter.options[1]!.selected = false;
        methodFilter.options[0]!.selected = true;
        methodFilter.options[0]!.setAttribute("selected", "");
        methodFilter.setAttribute("value", "GET");
        methodFilter.dispatchEvent(new Event("change", { bubbles: true }));
        picker.shadowRoot!.querySelector<HTMLInputElement>(".source-alias")!.value = "plans";
        picker.shadowRoot!.querySelector<HTMLSelectElement>(".source-trigger")!.selectedIndex = 1;
        const rows = picker.shadowRoot!.querySelectorAll<HTMLElement>(".param-row");
        rows[0]!.querySelector<HTMLInputElement>(".param-value")!.value = "address";
        rows[1]!.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex = 1;
        rows[1]!.querySelector<HTMLInputElement>(".param-value")!.value = "5";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail?.action).toBe("set-source");
        expect(detail?.editor).toBe(editor);
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
