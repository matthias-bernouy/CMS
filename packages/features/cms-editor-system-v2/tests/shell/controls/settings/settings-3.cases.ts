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
    test("settings view emits page-link setting changes", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () =>
            new Response(JSON.stringify([{ title: "Contact", path: "/contact" }]), {
                headers: { "Content-Type": "application/json" },
            })) as typeof fetch;

        const { SETTINGS_VIEW_SETTING_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );
        const { PageLink } = await import("../../../../src/components/Controls/Pickers/PageLink/PageLink");
        if (!customElements.get("cms-editor-v2-page-link")) {
            customElements.define("cms-editor-v2-page-link", class extends PageLink {});
        }

        const view = new SettingsView();
        const values: string[] = [];
        view.addEventListener(SETTINGS_VIEW_SETTING_CHANGE_EVENT, (event) => {
            values.push(String((event as CustomEvent<{ value: string }>).detail.value));
        });
        document.body.append(view);

        view.setSettings([
            {
                kind: "self",
                label: "Link",
                settings: [
                    {
                        type: "page-link",
                        label: "CTA link",
                        attribute: "href",
                        defaultValue: "",
                        allowPage: true,
                        allowExternal: true,
                    },
                ],
            },
        ]);
        await new Promise((resolve) => setTimeout(resolve, 0));

        view.shadowRoot!.querySelector("cms-editor-v2-page-link")!
            .shadowRoot!.querySelector<HTMLButtonElement>(".page-option")!
            .click();

        expect(values).toEqual(["/contact"]);
    });
});
