import {
    describe,
    expect,
    installDom,
    parseHTML,
    setShellFrameDocument,
    shellParts,
    shellState,
    test,
} from "../../support/shellTestSupport";
import { createNativeEditorCatalog } from "../../../../src/native/catalog";

describe("Shell root media", () => {
    test("adds an image and replaces it with a sanitized SVG through platform media items", async () => {
        installDom();
        document.head.innerHTML = `<meta name="basePath" content="/cms">`;
        globalThis.fetch = (async (input) => {
            const url = String(input);
            if (url.includes("/api/files?")) {
                return Response.json({
                    items: [
                        { id: "photo", name: "Photo.png", parentId: null, type: "file", mimeType: "image/png" },
                        { id: "logo", name: "Logo.svg", parentId: null, type: "file", mimeType: "image/svg+xml" },
                    ],
                });
            }
            return new Response(
                '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" onload="alert(1)"><path d="M0 0h1" /></svg>',
                { headers: { "Content-Type": "image/svg+xml" } },
            );
        }) as typeof fetch;

        const { Shell } = await import("../../../../src/exports");
        const { document: frameDocument } = parseHTML(`
            <div data-cms-editor-root>
                <div data-cms-content></div>
            </div>
        `);
        const root = frameDocument.querySelector<HTMLElement>("[data-cms-editor-root]")!;
        const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
        const shell = new Shell();
        document.body.append(shell);
        shell.setCatalog(createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor));
        setShellFrameDocument(shell, frameDocument);
        shell.loadDocument({ root, contentRoot });

        shellParts(shell).mutations.addRoot({ kind: "media", label: "Image", accept: ["image"] });
        await chooseFirstMediaItem();

        const image = contentRoot.querySelector<HTMLImageElement>("img")!;
        expect(image.getAttribute("src")).toBe("/cms/.cms/files/by-id/photo");
        expect(image.getAttribute("alt")).toBe("Photo.png");
        expect(image.getAttribute("loading")).toBe("lazy");
        expect(image.getAttribute("fetchpriority")).toBe("auto");
        expect(contentRoot.children).toHaveLength(1);

        const imageEditor = shellState(shell).runtime!.getEditor(image)!;
        shellParts(shell).mutations.replaceEditor(imageEditor, {
            kind: "media",
            label: "SVG",
            accept: ["svg"],
        });
        await chooseFirstMediaItem();

        const svg = contentRoot.querySelector("svg")!;
        expect(svg.getAttribute("viewBox")).toBe("0 0 16 16");
        expect(svg.getAttribute("aria-hidden")).toBe("true");
        expect(svg.hasAttribute("role")).toBe(false);
        expect(svg.hasAttribute("onload")).toBe(false);
        expect(contentRoot.querySelector("img")).toBeNull();
    });
});

async function chooseFirstMediaItem(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
    const center = document.body.querySelector("cms-editor-v2-files-center")!;
    center.shadowRoot!.querySelector<HTMLButtonElement>(".item")!.click();
    center.shadowRoot!.querySelector<HTMLButtonElement>(".select")!.click();
    await new Promise((resolve) => setTimeout(resolve, 0));
}
