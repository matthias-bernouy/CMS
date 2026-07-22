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
    test("renders disabled segmented settings as disabled buttons", async () => {
        installDom();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Style",
                settings: [
                    {
                        type: "segmented",
                        label: "Mode",
                        attribute: "mode",
                        defaultValue: "a",
                        disabled: true,
                        options: [
                            { label: "A", value: "a" },
                            { label: "B", value: "b" },
                        ],
                    },
                ],
            },
        ]);

        const buttons = Array.from(
            view.shadowRoot!.querySelectorAll<HTMLButtonElement>("cms-editor-v2-segmented-control button"),
        );

        expect(buttons.map((button) => button.disabled)).toEqual([true, true]);
        buttons[1]?.click();
        expect(emitted).toBe(false);
    });

    test("settings view emits raw color values through the configured attribute", async () => {
        installDom();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );

        const view = new SettingsView();
        const events: Array<{
            value: string | boolean;
            attributes?: Record<string, string | boolean | null>;
        }> = [];
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            const detail = (
                event as CustomEvent<{
                    value: string | boolean;
                    attributes?: Record<string, string | boolean | null>;
                }>
            ).detail;
            events.push({
                value: detail.value,
                attributes: detail.attributes,
            });
        });

        view.setThemeTokens([
            {
                label: "Primary",
                variable: "primary-base",
                category: "Colors · Brand",
            },
        ]);

        view.setSettings([
            {
                kind: "self",
                label: "Appearance",
                settings: [
                    {
                        type: "color",
                        label: "Background",
                        attribute: "background",
                        defaultValue: "#eef5d8",
                    },
                ],
            },
        ]);

        const picker = view.shadowRoot!.querySelector<HTMLInputElement>(".color-custom-picker")!;
        picker.value = "#123456";
        picker.dispatchEvent(new Event("input", { bubbles: true }));
        expect(events.at(-1)).toEqual({
            value: "#123456",
            attributes: undefined,
        });

        const input = view.shadowRoot!.querySelector<HTMLInputElement>(".color-custom-input")!;
        input.value = "var(--theme-accent)";
        input.dispatchEvent(new Event("change", { bubbles: true }));
        expect(events.at(-1)).toEqual({
            value: "var(--theme-accent)",
            attributes: undefined,
        });

        const token = view.shadowRoot!.querySelector<HTMLSelectElement>(".color-token-select")!;
        token.querySelector<HTMLOptionElement>('option[value="var(--primary-base)"]')!.selected = true;
        token.dispatchEvent(new Event("change", { bubbles: true }));
        expect(events.at(-1)).toEqual({
            value: "var(--primary-base)",
            attributes: undefined,
        });
    });
});
