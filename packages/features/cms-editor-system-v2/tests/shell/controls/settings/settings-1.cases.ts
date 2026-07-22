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
    test("settings view filters conditional settings from current values", async () => {
        installDom();

        const { SettingsView } = await import("../../../../src/components/Settings/SettingsView/SettingsView");
        const view = new SettingsView();

        const settings = (mode: "auto" | "columns") => [
            {
                kind: "self" as const,
                label: "Grid",
                settings: [
                    {
                        type: "segmented" as const,
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: mode,
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "Columns", value: "columns" },
                        ],
                    },
                    {
                        type: "select" as const,
                        label: "Minimum item width",
                        attribute: "min",
                        defaultValue: "md",
                        options: [{ label: "Medium", value: "md" }],
                        visibleWhen: { attribute: "mode", equals: "auto" },
                    },
                    {
                        type: "select" as const,
                        label: "Columns",
                        attribute: "columns",
                        defaultValue: "3",
                        options: [{ label: "3 columns", value: "3" }],
                        visibleWhen: { attribute: "mode", equals: "columns" },
                    },
                ],
            },
        ];

        view.setSettings(settings("auto"));
        expect(
            [...view.shadowRoot!.querySelectorAll("cms-editor-v2-select")].map((el) => el.getAttribute("label")),
        ).toEqual(["Minimum item width"]);

        view.setSettings(settings("columns"));
        expect(
            [...view.shadowRoot!.querySelectorAll("cms-editor-v2-select")].map((el) => el.getAttribute("label")),
        ).toEqual(["Columns"]);
    });

    test("settings view renders visible row children inline", async () => {
        installDom();

        const { SettingsView } = await import("../../../../src/components/Settings/SettingsView/SettingsView");
        const view = new SettingsView();

        const settings = (mode: "auto" | "columns" | "manual") => [
            {
                kind: "self" as const,
                label: "Grid",
                settings: [
                    {
                        type: "segmented" as const,
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: mode,
                        options: [
                            { label: "Auto", value: "auto" },
                            { label: "Columns", value: "columns" },
                            { label: "Manual", value: "manual" },
                        ],
                    },
                    {
                        type: "row" as const,
                        label: "Sizing",
                        settings: [
                            {
                                type: "select" as const,
                                label: "X",
                                ariaLabel: "Minimum item width",
                                attribute: "min",
                                defaultValue: "md",
                                options: [{ label: "Medium", value: "md" }],
                                visibleWhen: { attribute: "mode", equals: "auto" },
                            },
                            {
                                type: "select" as const,
                                label: "Columns",
                                attribute: "columns",
                                defaultValue: "3",
                                options: [{ label: "3 columns", value: "3" }],
                                visibleWhen: { attribute: "mode", equals: "columns" },
                            },
                        ],
                    },
                ],
            },
        ];

        view.setSettings(settings("auto"));
        expect(view.shadowRoot!.querySelector(".setting-row")?.classList.contains("setting-row-labeled")).toBe(true);
        expect(view.shadowRoot!.querySelector(".setting-row-label")?.textContent).toBe("Sizing");
        expect(
            [...view.shadowRoot!.querySelectorAll(".setting-row cms-editor-v2-select")].map((el) =>
                el.getAttribute("label"),
            ),
        ).toEqual(["X"]);
        expect(
            [...view.shadowRoot!.querySelectorAll(".setting-row cms-editor-v2-select")].map((el) =>
                el.getAttribute("aria-label"),
            ),
        ).toEqual(["Minimum item width"]);

        view.setSettings(settings("columns"));
        expect(
            [...view.shadowRoot!.querySelectorAll(".setting-row cms-editor-v2-select")].map((el) =>
                el.getAttribute("label"),
            ),
        ).toEqual(["Columns"]);

        view.setSettings(settings("manual"));
        expect(view.shadowRoot!.querySelector(".setting-row")).toBeNull();
    });
});
