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
    test("page link control selects internal pages and external URLs", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const calls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response(
                JSON.stringify([
                    { title: "Pricing", path: "/pricing" },
                    { title: "About", path: "/about" },
                ]),
                {
                    headers: { "Content-Type": "application/json" },
                },
            );
        }) as typeof fetch;

        const { PageLink } = await import("../../../../src/components/Controls/Pickers/PageLink/PageLink");
        const control = new PageLink();
        const values: string[] = [];
        control.addEventListener("input", (event) => {
            values.push((event as CustomEvent<{ value: string }>).detail.value);
        });
        document.body.append(control);
        control.connectedCallback();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(calls).toEqual(["/cms/api/page/links"]);

        const search = control.shadowRoot!.querySelector<HTMLInputElement>(".search")!;
        search.value = "pricing";
        search.dispatchEvent(new Event("input", { bubbles: true }));

        control.shadowRoot!.querySelector<HTMLButtonElement>(".page-option")!.click();
        expect(values.at(-1)).toBe("/pricing");
        expect(control.getAttribute("value")).toBe("/pricing");

        control.shadowRoot!.querySelectorAll<HTMLButtonElement>(".tabs button")[1]!.click();
        const external = control.shadowRoot!.querySelector<HTMLInputElement>(".external-input")!;
        external.value = "https://example.com";
        external.dispatchEvent(new Event("input", { bubbles: true }));

        expect(values.at(-1)).toBe("https://example.com");
        expect(control.getAttribute("value")).toBe("https://example.com");
    });

    test("files center selects files by opaque id url", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        const calls: string[] = [];
        globalThis.fetch = (async (url: string | URL | Request) => {
            calls.push(String(url));
            return new Response(
                JSON.stringify({
                    items: [
                        { id: "folder-1", name: "Documents", parentId: null, type: "folder" },
                        {
                            id: "file 1",
                            name: "Guide.pdf",
                            parentId: null,
                            type: "file",
                            size: 1200,
                            mimeType: "application/pdf",
                            contentHash: "hash",
                        },
                    ],
                }),
                {
                    headers: { "Content-Type": "application/json" },
                },
            );
        }) as typeof fetch;

        const { FilesCenter } = await import("../../../../src/components/Controls/Pickers/FilesCenter/FilesCenter");
        const center = new FilesCenter();
        const selected: string[] = [];
        center.addEventListener("select-file", (event) => {
            selected.push((event as CustomEvent<{ src: string }>).detail.src);
        });
        document.body.append(center);
        center.connectedCallback();
        center.show();
        await new Promise((resolve) => setTimeout(resolve, 0));

        expect(calls.at(0)).toBe("/cms/api/files?accept=folder%2Cfile&sortBy=name&limit=10000");

        const file = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item")).find((button) =>
            button.textContent?.includes("Guide.pdf"),
        )!;
        file.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(selected).toEqual(["/cms/.cms/files/by-id/file%201"]);
    });

    test("files center supports multiple file selection with a limit", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    items: [
                        { id: "one", name: "One.png", parentId: null, type: "file", mimeType: "image/png" },
                        { id: "two", name: "Two.png", parentId: null, type: "file", mimeType: "image/png" },
                        { id: "three", name: "Three.png", parentId: null, type: "file", mimeType: "image/png" },
                    ],
                }),
                {
                    headers: { "Content-Type": "application/json" },
                },
            )) as typeof fetch;

        const { FilesCenter } = await import("../../../../src/components/Controls/Pickers/FilesCenter/FilesCenter");
        const center = new FilesCenter();
        const selected: string[][] = [];
        center.addEventListener("select-files", (event) => {
            selected.push((event as CustomEvent<{ files: { src: string }[] }>).detail.files.map((file) => file.src));
        });
        document.body.append(center);
        center.connectedCallback();
        center.show({ multiple: true, maxSelection: 2 });
        await new Promise((resolve) => setTimeout(resolve, 0));

        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        items[0]!.click();
        items[1]!.click();
        items[2]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        expect(selected).toEqual([["/cms/.cms/files/by-id/one", "/cms/.cms/files/by-id/two"]]);
    });
});
