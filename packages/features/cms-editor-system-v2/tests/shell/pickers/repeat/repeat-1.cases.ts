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
    test("repeat picker emits selected array and alias", async () => {
        installDom();

        const { REPEAT_PICKER_SELECT_EVENT, RepeatPicker } = await import(
            "../../../../src/components/Layout/Pickers/RepeatPicker/RepeatPicker"
        );

        const picker = new RepeatPicker();
        document.body.append(picker);

        let detail: { path: string; alias: string } | undefined;
        picker.addEventListener(REPEAT_PICKER_SELECT_EVENT, (event) => {
            detail = (event as CustomEvent<{ path: string; alias: string }>).detail;
        });

        picker.open([
            {
                name: "data",
                label: "Plans",
                fields: [
                    {
                        path: "features",
                        type: "array",
                        children: [
                            { path: "name", type: "string" },
                            {
                                path: "geometry",
                                type: "object",
                                children: [
                                    {
                                        path: "coordinates",
                                        type: "array",
                                        children: [{ path: ".", type: "number" }],
                                    },
                                ],
                            },
                        ],
                    },
                ],
            },
            {
                name: "data",
                label: "Plans",
                fields: [
                    {
                        path: "features",
                        type: "array",
                        children: [{ path: "name", type: "string" }],
                    },
                ],
            },
        ]);
        expect(picker.shadowRoot!.querySelectorAll(".array")).toHaveLength(1);
        const fieldPaths = Array.from(picker.shadowRoot!.querySelectorAll(".field-path")).map(
            (item) => item.textContent,
        );
        expect(fieldPaths).toContain("geometry");
        expect(fieldPaths).toContain("coordinates");
        picker.shadowRoot!.querySelector<HTMLInputElement>(".alias")!.value = "plan";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail).toEqual({
            path: "data.features",
            alias: "plan",
        });
    });
});
