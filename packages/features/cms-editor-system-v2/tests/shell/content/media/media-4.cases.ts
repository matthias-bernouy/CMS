import {
    Editor,
    describe,
    expect,
    installDom,
    parseHTML,
    setShellFrameDocument,
    shellParts,
    test,
} from "../../support/shellTestSupport";
import { createNativeEditorCatalog } from "../../../../src/native/catalog";

describe("Shell media trust boundaries", () => {
    test("rejects unsupported root media before opening the picker", async () => {
        const { shell, contentRoot } = await shellWithEmptyDocument();

        shellParts(shell).mutations.addRoot({ kind: "media", label: "Video", accept: ["video"] });

        expect(document.body.querySelector("cms-editor-v2-files-center")).toBeNull();
        expect(contentRoot.children).toHaveLength(0);
    });

    test("rejects a forged file type even when a matching native catalog entry is injected", async () => {
        const { shell, contentRoot } = await shellWithEmptyDocument(true);

        shellParts(shell).mutations.addRoot({ kind: "media", label: "Image", accept: ["image"] });
        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        center.dispatchEvent(
            new CustomEvent("select-file", {
                detail: {
                    id: "movie",
                    label: "Movie.mp4",
                    src: "/cms/.cms/files/by-id/movie",
                    mimeType: "video/mp4",
                },
            }),
        );
        await nextTask();

        expect(contentRoot.querySelector("video")).toBeNull();
        expect(contentRoot.children).toHaveLength(0);
    });

    test("rejects a forged external source even when it contains the CMS file route", async () => {
        const { shell, contentRoot } = await shellWithEmptyDocument();

        shellParts(shell).mutations.addRoot({ kind: "media", label: "Image", accept: ["image"] });
        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        center.dispatchEvent(
            new CustomEvent("select-file", {
                detail: {
                    id: "photo",
                    label: "Photo.png",
                    src: "https://attacker.example/.cms/files/by-id/photo",
                    mimeType: "image/png",
                },
            }),
        );
        await nextTask();

        expect(contentRoot.children).toHaveLength(0);
    });

    test("drops an asynchronous SVG result after the editor document changes", async () => {
        let resolveSvg: ((response: Response) => void) | undefined;
        const svgResponse = new Promise<Response>((resolve) => {
            resolveSvg = resolve;
        });
        const { shell, frameDocument, contentRoot } = await shellWithEmptyDocument(false, (input) => {
            if (String(input).includes("/.cms/files/by-id/slow")) {
                return svgResponse;
            }
            return Promise.resolve(Response.json({ items: [] }));
        });

        shellParts(shell).mutations.addRoot({ kind: "media", label: "SVG", accept: ["svg"] });
        const center = document.body.querySelector("cms-editor-v2-files-center")!;
        center.dispatchEvent(
            new CustomEvent("select-file", {
                detail: {
                    id: "slow",
                    label: "Slow.svg",
                    src: "/cms/.cms/files/by-id/slow",
                    mimeType: "image/svg+xml",
                },
            }),
        );

        const nextRoot = frameDocument.createElement("div");
        const nextContent = frameDocument.createElement("div");
        nextContent.setAttribute("data-cms-content", "");
        nextRoot.append(nextContent);
        frameDocument.body.append(nextRoot);
        shell.loadDocument({ root: nextRoot, contentRoot: nextContent });
        resolveSvg!(new Response('<svg xmlns="http://www.w3.org/2000/svg"><title>Safe</title></svg>'));
        await nextTask();

        expect(contentRoot.querySelector("svg")).toBeNull();
        expect(nextContent.querySelector("svg")).toBeNull();
    });
});

async function shellWithEmptyDocument(
    includeVideo = false,
    fetchImplementation: (input: string | URL | Request) => Promise<Response> = async () =>
        Response.json({ items: [] }),
) {
    installDom();
    document.head.innerHTML = `<meta name="basePath" content="/cms">`;
    globalThis.fetch = fetchImplementation as typeof fetch;
    const { Shell } = await import("../../../../src/exports");
    const { document: frameDocument } = parseHTML("<div><div data-cms-content></div></div>");
    const root = frameDocument.querySelector<HTMLElement>("div")!;
    const contentRoot = frameDocument.querySelector<HTMLElement>("[data-cms-content]")!;
    const shell = new Shell();
    document.body.append(shell);
    const catalog = createNativeEditorCatalog(HTMLElement as unknown as CustomElementConstructor);
    if (includeVideo) {
        catalog.push({
            tag: "video",
            label: "Video",
            bloc: HTMLElement as unknown as CustomElementConstructor,
            editor: Editor,
        });
    }
    shell.setCatalog(catalog);
    setShellFrameDocument(shell, frameDocument);
    shell.loadDocument({ root, contentRoot });
    return { shell, frameDocument, contentRoot };
}

async function nextTask(): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, 0));
}
