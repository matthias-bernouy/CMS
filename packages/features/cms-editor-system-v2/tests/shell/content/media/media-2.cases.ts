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
    test("shell inserts multiple media files up to slot capacity", async () => {
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

        const { Shell } = await import("../../../../src/exports");

        class GalleryEditor extends Editor {
            protected override contentSlots() {
                return [
                    {
                        label: "Images",
                        slot: "image",
                        max: 3,
                        accepts: [{ kind: "media" as const, accept: ["image" as const] }],
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
        const gallery = frameDocument.createElement("demo-gallery");
        const existing = frameDocument.createElement("img");
        existing.setAttribute("slot", "image");
        gallery.append(existing);
        contentRoot.append(gallery);
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
                tag: "demo-gallery",
                label: "Gallery",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: GalleryEditor,
            },
            {
                tag: "img",
                label: "Image",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: Editor,
            },
        ]);
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        const runtime = shellState(shell).runtime!;
        const galleryEditor = runtime.getEditor(gallery);
        if (!galleryEditor) {
            throw new Error("Missing gallery editor.");
        }

        shellParts(shell).mutations.addChild(
            galleryEditor,
            {
                kind: "media",
                label: "Media",
                accept: ["image"],
            },
            "image",
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        const items = Array.from(center.shadowRoot!.querySelectorAll<HTMLButtonElement>(".item"));
        items[0]!.click();
        items[1]!.click();
        items[2]!.click();
        center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const images = Array.from(gallery.querySelectorAll("img"));
        expect(images.map((image) => image.getAttribute("src"))).toEqual([
            null,
            "/cms/.cms/files/by-id/one",
            "/cms/.cms/files/by-id/two",
        ]);
        expect(images.map((image) => image.getAttribute("slot"))).toEqual(["image", "image", "image"]);
    });
});
