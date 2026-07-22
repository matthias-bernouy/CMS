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
    test("page link media mode opens the files center", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async (url: string | URL | Request) => {
            const href = String(url);
            if (href.includes("/api/page/links")) {
                return new Response(JSON.stringify([]), {
                    headers: { "Content-Type": "application/json" },
                });
            }
            return new Response(
                JSON.stringify({
                    items: [
                        {
                            id: "hero",
                            name: "Hero.png",
                            parentId: null,
                            type: "file",
                            mimeType: "image/png",
                        },
                    ],
                }),
                {
                    headers: { "Content-Type": "application/json" },
                },
            );
        }) as typeof fetch;

        const { PageLink } = await import("../../../../src/components/Controls/Pickers/PageLink/PageLink");
        const control = new PageLink();
        control.setAttribute("allow-media", "true");
        const values: string[] = [];
        control.addEventListener("input", (event) => {
            values.push((event as CustomEvent<{ value: string }>).detail.value);
        });
        document.body.append(control);
        control.connectedCallback();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const mediaTab = Array.from(control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")).find(
            (button) => button.textContent === "Media",
        )!;
        mediaTab.click();
        control.shadowRoot!.querySelector<HTMLButtonElement>(".file-button")!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        center.shadowRoot!.querySelector<HTMLButtonElement>(".item")!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(values).toEqual(["/cms/.cms/files/by-id/hero"]);
        expect(control.getAttribute("value")).toBe("/cms/.cms/files/by-id/hero");
        expect(control.shadowRoot!.querySelector(".file-title")?.textContent).toBe("Hero.png");
    });

    test("page link media-only mode hides tabs and renders selected file preview", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const { PageLink } = await import("../../../../src/components/Controls/Pickers/PageLink/PageLink");
        const control = new PageLink();
        control.setAttribute("allow-page", "false");
        control.setAttribute("allow-external", "false");
        control.setAttribute("allow-media", "true");
        control.setAttribute("value", "/cms/.cms/files/by-id/hero");
        document.body.append(control);
        control.connectedCallback();

        expect(control.shadowRoot!.querySelector<HTMLElement>(".tabs")!.hidden).toBe(true);
        expect(control.shadowRoot!.querySelector(".file-title")?.textContent).toBe("Image");
        expect(control.shadowRoot!.querySelector<HTMLElement>(".file-value")!.hidden).toBe(true);
        expect(control.shadowRoot!.querySelector<HTMLImageElement>(".file-preview img")?.getAttribute("src")).toBe(
            "/cms/.cms/files/by-id/hero",
        );
        expect(control.shadowRoot!.querySelector<HTMLElement>(".target")!.hidden).toBe(true);
    });
});
