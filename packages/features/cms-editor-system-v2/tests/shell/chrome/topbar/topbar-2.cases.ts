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
    test("topbar emits delete document action", async () => {
        installDom();

        const { TOPBAR_DELETE_EVENT, TopBar } = await import("../../../../src/components/Layout/TopBar/TopBar");

        const topbar = new TopBar();
        document.body.append(topbar);
        topbar.connectedCallback();

        let count = 0;
        topbar.addEventListener(TOPBAR_DELETE_EVENT, () => {
            count++;
        });
        topbar.shadowRoot!.querySelector<HTMLButtonElement>('[data-action="delete"]')!.click();

        expect(count).toBe(1);
    });
});
