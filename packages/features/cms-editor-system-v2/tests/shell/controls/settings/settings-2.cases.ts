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
    test("settings view renders segmented icon options without visible text", async () => {
        installDom();

        const { SettingsView } = await import("../../../../src/components/Settings/SettingsView/SettingsView");
        const view = new SettingsView();

        view.setSettings([
            {
                kind: "self",
                label: "Layout",
                settings: [
                    {
                        type: "segmented",
                        label: "Flow",
                        ariaLabel: "Layout",
                        attribute: "layout",
                        defaultValue: "column",
                        display: "icon",
                        labelDisplay: "hidden",
                        options: [
                            { label: "None", value: "none", icon: "layout-none", ariaLabel: "No layout" },
                            { label: "Column", value: "column", icon: "layout-column" },
                        ],
                    },
                ],
            },
        ]);

        const buttons = Array.from(
            view.shadowRoot!.querySelectorAll<HTMLButtonElement>("cms-editor-v2-segmented-control button"),
        );
        const labels = Array.from(view.shadowRoot!.querySelectorAll(".field-label")).map((label) => label.textContent);
        expect(labels).not.toContain("Flow");
        expect(view.shadowRoot!.querySelector("cms-editor-v2-segmented-control")?.getAttribute("aria-label")).toBe(
            "Layout",
        );
        expect(buttons.map((button) => button.textContent)).toEqual(["", ""]);
        expect(buttons.map((button) => button.ariaLabel)).toEqual(["No layout", "Column"]);
        expect(buttons.map((button) => button.querySelector("svg") !== null)).toEqual([true, true]);
    });

    test("settings view emits attribute cleanup rules for setting values", async () => {
        installDom();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );
        const view = new SettingsView();
        let detail: { value: string | boolean; attributes?: Record<string, string | boolean | null> } | undefined;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            detail = (event as CustomEvent<typeof detail>).detail;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Grid",
                settings: [
                    {
                        type: "segmented",
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: "auto",
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "Columns", value: "columns" },
                        ],
                        attributesOnValue: [
                            { value: "auto", attributes: { columns: null } },
                            { value: "columns", attributes: { min: null } },
                        ],
                    },
                ],
            },
        ]);

        Array.from(view.shadowRoot!.querySelectorAll<HTMLButtonElement>("button"))
            .find((button) => button.value === "columns")!
            .click();

        expect(detail?.value).toBe("columns");
        expect(detail?.attributes).toEqual({
            mode: "columns",
            min: null,
        });
    });
});
