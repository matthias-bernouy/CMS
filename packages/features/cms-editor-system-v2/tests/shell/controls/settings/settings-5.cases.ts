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
    test("settings view emits source body attributes for endpoint-picker source bindings", async () => {
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
        document.body.append(view);

        view.setSettings(
            [
                {
                    kind: "self",
                    label: "Form",
                    settings: [
                        {
                            type: "endpoint-picker",
                            label: "Submit source",
                            attribute: CMS_BINDING_ATTRIBUTES.source,
                            methodAttribute: CMS_BINDING_ATTRIBUTES.sourceMethod,
                            defaultMethod: "POST",
                            methods: ["POST"],
                        },
                    ],
                },
            ],
            null,
            "",
            "settings",
            [],
            [],
            [
                {
                    label: "Log in",
                    url: "/login",
                    method: "POST",
                    body: {
                        contentType: "application/json",
                        fields: [{ path: "returnTo", type: "string" }],
                    },
                    fields: [],
                },
            ],
        );

        view.shadowRoot!.querySelector<HTMLButtonElement>(".endpoint-button")!.click();

        const picker = view.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        const row = picker.shadowRoot!.querySelector<HTMLElement>('.param-row[data-binding-kind="body"]')!;
        row.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex = 0;
        row.querySelector<HTMLInputElement>(".param-value")!.value = "returnTo";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(events).toHaveLength(1);
        expect(events[0]!.value).toBe("/login as data");
        expect(events[0]!.attributes?.[CMS_BINDING_ATTRIBUTES.source]).toBe("/login as data");
        expect(events[0]!.attributes?.[CMS_BINDING_ATTRIBUTES.sourceMethod]).toBe("POST");
        expect(JSON.parse(String(events[0]!.attributes?.[CMS_BINDING_ATTRIBUTES.sourceBody]))).toEqual({
            returnTo: { from: "queryParam", name: "returnTo" },
        });
    });

    test("renders disabled settings as disabled controls", async () => {
        installDom();

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );
        if (!customElements.get("cms-editor-v2-text-input")) {
            customElements.define(
                "cms-editor-v2-text-input",
                class extends HTMLElement {
                    constructor() {
                        super();
                        this.attachShadow({ mode: "open" }).innerHTML = "<input>";
                    }
                },
            );
        }

        const view = new SettingsView();
        let emitted = false;
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, () => {
            emitted = true;
        });

        view.setSettings([
            {
                kind: "self",
                label: "Template",
                settings: [
                    {
                        type: "text",
                        label: "Identifier",
                        attribute: "identifier",
                        defaultValue: "main-nav",
                        disabled: true,
                    },
                ],
            },
        ]);

        const control = view.shadowRoot!.querySelector("cms-editor-v2-text-input")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;

        expect(control.hasAttribute("disabled")).toBe(true);
        expect(input.disabled).toBe(true);

        input.value = "changed";
        input.dispatchEvent(
            new Event("input", {
                bubbles: true,
            }),
        );

        expect(emitted).toBe(false);
    });
});
