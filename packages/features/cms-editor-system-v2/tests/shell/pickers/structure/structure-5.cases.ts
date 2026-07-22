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
    test("structure tree uses the default template on empty pages", async () => {
        installDom();

        const { StructureTree } = await import("../../../../src/components/Layout/StructureTree/StructureTree");

        const tree = new StructureTree();
        document.body.append(tree);
        tree.setInsertItems([
            {
                kind: "template",
                id: "tpl-default",
                label: "Default layout",
                category: "Layouts",
                description: "Default page layout.",
                content: "<main></main>",
            },
            {
                kind: "template",
                id: "tpl-other",
                label: "Other layout",
                category: "Other",
                content: "<section></section>",
            },
        ]);
        tree.setDefaultTemplateSelection({ category: "Layouts" });
        tree.setStructure([], null);

        let detail: StructureTreeActionDetail | undefined;
        tree.addEventListener("editor-v2:structure-action", (event) => {
            detail = (event as CustomEvent<StructureTreeActionDetail>).detail;
        });

        const button = tree.shadowRoot!.querySelector<HTMLButtonElement>(".empty button")!;
        expect(button.textContent).toBe("Use default template");
        button.click();

        expect(detail?.action).toBe("add-root");
        expect(detail?.item?.kind).toBe("template");
        expect(detail?.item?.id).toBe("tpl-default");
    });
});
