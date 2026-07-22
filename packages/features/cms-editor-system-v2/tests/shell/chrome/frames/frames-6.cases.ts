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
    test("canvas allows form-capable preview frames and blocks native editor form submits", async () => {
        installDom();

        const { Canvas } = await import("../../../../src/components/Layout/Canvas/Canvas");

        const canvas = new Canvas();
        document.body.append(canvas);
        canvas.connectedCallback();

        const editorFrame = canvas.shadowRoot!.querySelector<HTMLIFrameElement>(".editor-frame")!;
        const viewFrame = canvas.shadowRoot!.querySelector<HTMLIFrameElement>(".view-frame")!;
        expect(editorFrame.getAttribute("sandbox")).toContain("allow-forms");
        expect(viewFrame.getAttribute("sandbox")).toContain("allow-forms");

        const editorDom = parseHTML("<!doctype html><html><body><form></form></body></html>");
        Object.defineProperty(editorFrame, "contentDocument", {
            configurable: true,
            value: editorDom.document,
        });
        editorFrame.dispatchEvent(new Event("load"));

        const editorSubmit = new Event("submit", { bubbles: true, cancelable: true });
        editorDom.document.querySelector("form")!.dispatchEvent(editorSubmit);
        expect(editorSubmit.defaultPrevented).toBe(true);

        const viewDom = parseHTML("<!doctype html><html><body><form></form></body></html>");
        Object.defineProperty(viewFrame, "contentDocument", {
            configurable: true,
            value: viewDom.document,
        });
        viewFrame.dispatchEvent(new Event("load"));

        const viewSubmit = new Event("submit", { bubbles: true, cancelable: true });
        viewDom.document.querySelector("form")!.dispatchEvent(viewSubmit);
        expect(viewSubmit.defaultPrevented).toBe(false);
    });

    test("receives the editor catalog", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");

        class DemoBloc extends HTMLElement {}
        class DemoEditor {
            constructor(readonly target: HTMLElement) {}
        }

        const catalog: EditorCatalog = [
            {
                tag: "demo-bloc",
                label: "Demo bloc",
                bloc: DemoBloc,
                editor: DemoEditor as unknown as new (target: HTMLElement) => Editor,
            },
        ];
        const shell = new Shell();

        shell.setCatalog(catalog);

        expect(shell.catalog).toEqual(catalog);
        expect(shell.getAttribute("catalog-size")).toBe("1");
    });

    test("canvas emits a background click outside the page frame", async () => {
        installDom();

        const { CANVAS_BACKGROUND_CLICK_EVENT, Canvas } = await import(
            "../../../../src/components/Layout/Canvas/Canvas"
        );

        const canvas = new Canvas();
        const events: Event[] = [];
        canvas.addEventListener(CANVAS_BACKGROUND_CLICK_EVENT, (event) => events.push(event));
        document.body.append(canvas);
        canvas.connectedCallback();

        canvas.shadowRoot!.querySelector(".canvas")!.dispatchEvent(
            new Event("click", {
                bubbles: true,
                composed: true,
            }),
        );
        canvas.shadowRoot!.querySelector(".page")!.dispatchEvent(
            new Event("click", {
                bubbles: true,
                composed: true,
            }),
        );

        expect(events).toHaveLength(1);
    });
});
