import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    describe,
    expect,
    frameDetail,
    installDom,
    parseHTML,
    shellParts,
    test,
} from "./support";
import { shellState } from "../../support/shellTestSupport";

describe("Shell external preview", () => {
    test("keeps the external view document untouched", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        const { document: viewDocument } = parseHTML(`
            <${CMS_BINDING_CORE_TAG}><main data-cms-content><p>Server preview</p></main></${CMS_BINDING_CORE_TAG}>
        `);
        const { document: editorDocument } = parseHTML(`
            <${CMS_BINDING_CORE_TAG} data-cms-editor-root>
                <main data-cms-content><p>Draft content</p></main>
            </${CMS_BINDING_CORE_TAG}>
        `);
        const shell = new Shell();
        shell.setPreviewMode("external");
        document.body.append(shell);

        shellParts(shell).commands.handleFrameReady(frameDetail("view", viewDocument));
        shellParts(shell).commands.handleFrameReady(frameDetail("editor", editorDocument));

        expect(viewDocument.querySelector("[data-cms-content]")?.textContent).toBe("Server preview");
        expect(viewDocument.getElementById("cms-editor-binding-preview-style")).toBeNull();
        expect(
            viewDocument.querySelector(CMS_BINDING_CORE_TAG)?.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled),
        ).toBe(false);
    });

    test("configures frame URLs and reloads an unchanged preview URL", async () => {
        installDom();
        const { Shell } = await import("../../../../src/exports");
        const shell = new Shell();
        const canvas = shell.shadowRoot!.querySelector("cms-editor-v2-canvas") as HTMLElement & {
            reloadViewFrame(): void;
        };
        let reloads = 0;
        canvas.reloadViewFrame = () => {
            reloads += 1;
        };

        shell.setFrameUrls({ editor: "/builder/editor", view: "/builder/preview/42" });
        shell.reloadPreview("/builder/preview/42");

        expect(canvas.getAttribute("editor-frame-url")).toBe("/builder/editor");
        expect(canvas.getAttribute("view-frame-url")).toBe("/builder/preview/42");
        expect(reloads).toBe(1);

        shell.reloadPreview("/builder/preview/43");
        expect(canvas.getAttribute("view-frame-url")).toBe("/builder/preview/43");
        expect(reloads).toBe(1);
    });

    test("exposes explicit save and editor-mode commands to host builders", async () => {
        installDom();
        const { EDITOR_V2_SAVE_DOCUMENT_EVENT, Shell } = await import("../../../../src/exports");
        const { document: editorDocument } = parseHTML(`
            <div data-cms-editor-root><main data-cms-content><p>Draft</p></main></div>
        `);
        const shell = new Shell();
        document.body.append(shell);
        shellState(shell).pageConfig = {
            id: "draft-1",
            title: "Draft",
            path: "site-draft",
            description: "",
            tags: [],
            published: false,
        };
        shellParts(shell).commands.handleFrameReady(frameDetail("editor", editorDocument));
        let content = "";
        shell.addEventListener(EDITOR_V2_SAVE_DOCUMENT_EVENT, (event) => {
            content = (event as CustomEvent<{ content: string }>).detail.content;
        });

        shell.requestSave();
        shell.setEditorMode("view");

        expect(content).toBe("<p>Draft</p>");
        expect(shell.hasAttribute("view-mode")).toBe(true);
    });
});
