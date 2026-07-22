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
    test("settings view emits endpoint-picker setting changes with method attributes", async () => {
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
                    label: "Action",
                    settings: [
                        {
                            type: "endpoint-picker",
                            label: "Submit endpoint",
                            attribute: "target",
                            methodAttribute: "method",
                            methods: ["POST"],
                            defaultMethod: "POST",
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
                    label: "Current user",
                    url: "/cms/.cms/sources/system-auth/me",
                    method: "GET",
                    provider: "system-auth",
                    providerUrn: "urn:system-auth",
                    endpointUrn: "urn:system-auth:me",
                    fields: [],
                },
                {
                    label: "Log in",
                    url: "/cms/.cms/sources/system-auth/login",
                    method: "POST",
                    provider: "system-auth",
                    providerUrn: "urn:system-auth",
                    endpointUrn: "urn:system-auth:login",
                    fields: [],
                },
            ],
        );

        view.shadowRoot!.querySelector<HTMLButtonElement>(".endpoint-button")!.click();

        const picker = view.shadowRoot!.querySelector("cms-editor-v2-data-source-picker")!;
        const sources = Array.from(picker.shadowRoot!.querySelectorAll<HTMLButtonElement>(".source"));
        expect(sources.map((source) => source.textContent)).toEqual([
            "POSTLog inNo description./cms/.cms/sources/system-auth/login",
        ]);

        sources[0]!.click();
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(events).toEqual([
            {
                value: "/cms/.cms/sources/system-auth/login",
                attributes: {
                    target: "/cms/.cms/sources/system-auth/login",
                    method: "POST",
                },
            },
        ]);
    });
});
