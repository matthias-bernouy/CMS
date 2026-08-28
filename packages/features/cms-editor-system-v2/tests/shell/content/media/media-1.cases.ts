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
    test("shell inserts media into content slots as native image elements", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async () =>
            new Response(
                JSON.stringify({
                    items: [
                        {
                            id: "photo",
                            name: "Photo.png",
                            parentId: null,
                            type: "file",
                            mimeType: "image/png",
                        },
                        {
                            id: "logo",
                            name: "Logo.svg",
                            parentId: null,
                            type: "file",
                            mimeType: "image/svg+xml",
                        },
                    ],
                }),
                {
                    headers: { "Content-Type": "application/json" },
                },
            )) as typeof fetch;

        const { Shell } = await import("../../../../src/exports");

        class FigureEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Cover",
                        slot: "cover",
                        max: 1,
                        accepts: [{ kind: "media" as const, accept: ["svg" as const] }],
                    },
                ];
            }
        }

        const { document: frameDocument } = parseHTML(`
            <!DOCTYPE html>
            <html>
                <body></body>
            </html>
        `);
        const root = frameDocument.createElement("div");
        const contentRoot = frameDocument.createElement("div");
        contentRoot.setAttribute("data-cms-content", "");
        const figure = frameDocument.createElement("demo-figure");
        contentRoot.append(figure);
        root.append(contentRoot);
        frameDocument.body.append(root);

        const shell = new Shell();
        document.body.append(shell);
        const structureTree = shell.shadowRoot!.querySelector("cms-editor-v2-structure-tree") as Element & {
            setStructure?: () => void;
        };
        structureTree.setStructure = () => undefined;
        shell.setCatalog([
            {
                tag: "demo-figure",
                label: "Figure",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: FigureEditor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const figureEditor = runtime.getEditor(figure);
        if (!figureEditor) {
            throw new Error("Missing figure editor.");
        }

        shellParts(shell).mutations.addChild(
            figureEditor,
            {
                kind: "media",
                label: "Media",
                accept: ["svg"],
            },
            "cover",
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        expect(items.map((item) => item.textContent)).toEqual(["Logo.svgimage/svg+xml"]);

        items[0]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();

        const image = figure.querySelector("img")!;
        expect(image.getAttribute("slot")).toBe("cover");
        expect(image.getAttribute("src")).toBe("/cms/.cms/files/by-id/logo");
        expect(image.getAttribute("alt")).toBe("Logo.svg");

        Object.defineProperty(image, "naturalWidth", { value: 320, configurable: true });
        Object.defineProperty(image, "naturalHeight", { value: 180, configurable: true });
        image.dispatchEvent(new Event("load"));

        expect(image.getAttribute("width")).toBe("320");
        expect(image.getAttribute("height")).toBe("180");
    });
});
