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
    test("shell inserts sanitized SVG media as an inline SVG element", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;

        globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url.includes("/api/files?")) {
                return new Response(
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
                    { headers: { "Content-Type": "application/json" } },
                );
            }
            return new Response(
                `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" onload="alert(1)">
                    <title>Menu</title>
                    <path d="M2 6h20" fill="currentColor" onclick="alert(1)" />
                    <script>alert(1)</script>
                    <foreignObject><div>unsafe</div></foreignObject>
                </svg>`,
                { headers: { "Content-Type": "image/svg+xml" } },
            );
        }) as typeof fetch;

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
        root.setAttribute("data-cms-editor-root", "");
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
            {
                tag: "svg",
                label: "SVG",
                bloc: HTMLElement as unknown as CustomElementConstructor,
                editor: Editor,
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
        await new Promise((resolve) => setTimeout(resolve, 0));

        const svg = figure.querySelector("svg")!;
        expect(figure.querySelector("img")).toBeNull();
        expect(svg.ownerDocument).toBe(frameDocument);
        expect(svg.getAttribute("slot")).toBe("cover");
        expect(svg.getAttribute("viewBox")).toBe("0 0 24 24");
        expect(svg.getAttribute("onload")).toBeNull();
        expect(svg.querySelector("path")?.getAttribute("fill")).toBe("currentColor");
        expect(svg.querySelector("path")?.getAttribute("onclick")).toBeNull();
        expect(svg.querySelector("script")).toBeNull();
        expect(svg.querySelector("foreignObject")).toBeNull();

        svg.setAttribute("class", "button-icon");
        const svgEditor = shellState(shell).runtime!.getEditor(svg as unknown as HTMLElement)!;
        shellParts(shell).mutations.replaceEditor(
            svgEditor,
            { kind: "media", label: "Media", accept: ["svg"] },
            "cover",
        );
        await new Promise((resolve) => setTimeout(resolve, 0));

        const replacementCenter = document.body.querySelector("cms-editor-v2-files-center")!;
        replacementCenter.shadowRoot!.querySelector<HTMLButtonElement>(".item")!.click();
        replacementCenter.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();
        await new Promise((resolve) => setTimeout(resolve, 0));

        const replacement = figure.querySelector("svg")!;
        expect(replacement).not.toBe(svg);
        expect(replacement.getAttribute("slot")).toBe("cover");
        expect(replacement.getAttribute("class")).toBe("button-icon");
    });
});
