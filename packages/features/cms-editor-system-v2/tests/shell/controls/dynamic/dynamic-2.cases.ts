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
    test("text settings dynamic data inserts an interpolation and emits a setting change", async () => {
        installDom();
        await defineTextControls();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );

        const view = new SettingsView();
        const values: string[] = [];
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            values.push(String((event as CustomEvent<{ value: string }>).detail.value));
        });
        document.body.append(view);

        view.setSettings(
            [
                {
                    kind: "self",
                    label: "Image",
                    settings: [
                        {
                            type: "text",
                            label: "Alt text",
                            attribute: "alt",
                            defaultValue: "Plan ",
                        },
                    ],
                },
            ],
            null,
            "",
            "settings",
            [],
            dynamicDataScopes,
        );

        const control = view.shadowRoot!.querySelector<HTMLElement>("cms-editor-v2-text-input")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        input.setSelectionRange?.(input.value.length, input.value.length);

        openDynamicDataPicker(control);
        control.shadowRoot!.querySelector<HTMLButtonElement>(".data-option")!.click();

        expect(input.value).toBe("Plan {{ plans.title }}");
        expect(values).toEqual(["Plan {{ plans.title }}"]);
    });

    test("textarea settings dynamic data inserts an interpolation and emits a setting change", async () => {
        installDom();
        await defineTextControls();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );

        const view = new SettingsView();
        const values: string[] = [];
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            values.push(String((event as CustomEvent<{ value: string }>).detail.value));
        });
        document.body.append(view);

        view.setSettings(
            [
                {
                    kind: "self",
                    label: "Copy",
                    settings: [
                        {
                            type: "textarea",
                            label: "Description",
                            attribute: "description",
                            defaultValue: "Category: ",
                        },
                    ],
                },
            ],
            null,
            "",
            "settings",
            [],
            dynamicDataScopes,
        );

        const control = view.shadowRoot!.querySelector<HTMLElement>("cms-editor-v2-textarea")!;
        const textarea = control.shadowRoot!.querySelector<HTMLTextAreaElement>("textarea")!;
        textarea.setSelectionRange?.(textarea.value.length, textarea.value.length);

        openDynamicDataPicker(control);
        const options = Array.from(control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".data-option"));
        options.find((option) => option.dataset.path === "plans.meta.category")!.click();

        expect(textarea.value).toBe("Category: {{ plans.meta.category }}");
        expect(values).toEqual(["Category: {{ plans.meta.category }}"]);
    });
});
