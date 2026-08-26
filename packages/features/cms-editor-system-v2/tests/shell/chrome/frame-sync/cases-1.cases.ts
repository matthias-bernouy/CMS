import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_OUTPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    describe,
    expect,
    frameDetail,
    installDom,
    parseHTML,
    shellParts,
    test,
} from "./support";

describe("Shell frame binding sync", () => {
    test("syncs the view frame while keeping it inert until view mode", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: viewDocument } = parseHTML(`
            <div data-cms-editor-root>
                <${CMS_BINDING_CORE_TAG} ${CMS_BINDING_ATTRIBUTES.bindingDisabled} ${CMS_BINDING_ATTRIBUTES.sourceStateForce}="loading">
                    <main data-cms-content><p cms-condition="$source.loading">Loading</p></main>
                </${CMS_BINDING_CORE_TAG}>
            </div>
        `);
        const { document: editorDocument } = parseHTML(`
            <div data-cms-editor-root>
                <${CMS_BINDING_CORE_TAG}>
                    <main data-cms-content><section cms-source="/api/plans"><p>{{ plan.name }}</p></section></main>
                </${CMS_BINDING_CORE_TAG}>
            </div>
        `);
        const viewCore = viewDocument.querySelector(CMS_BINDING_CORE_TAG) as HTMLElement & {
            runtime?: { stop(): void } | null;
            startRuntime?: () => void;
        };
        const calls: string[] = [];
        viewCore.runtime = { stop: () => calls.push("stop") };
        viewCore.startRuntime = () => calls.push("start");

        const shell = new Shell();
        document.body.append(shell);
        shell.connectedCallback();

        shellParts(shell).commands.handleFrameReady(frameDetail("view", viewDocument));
        shellParts(shell).commands.handleFrameReady(frameDetail("editor", editorDocument));

        expect(viewDocument.querySelector("[data-cms-content]")?.innerHTML).toBe(
            `<section cms-source="/api/plans"><p>{{ plan.name }}</p></section>`,
        );
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(true);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe(false);
        expect(calls).toEqual([]);

        editorDocument.querySelector("[data-cms-content]")!.innerHTML = "<p data-latest>Latest edit</p>";
        shellParts(shell).state.editorMode = "view";
        shellParts(shell).commands.syncEditorMode();

        expect(viewDocument.querySelector("[data-cms-content]")?.innerHTML).toBe('<p data-latest="">Latest edit</p>');
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(false);
        expect(calls).toEqual([]);
    });

    test("does not serialize binding runtime stamps", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: editorDocument } = parseHTML(`
            <div data-cms-editor-root>
                <${CMS_BINDING_CORE_TAG}>
                    <main data-cms-content>
                        <section cms-source="/api/plans" cms-ready><p cms-ready>Plan</p></section>
                    </main>
                </${CMS_BINDING_CORE_TAG}>
            </div>
        `);

        const shell = new Shell();
        document.body.append(shell);
        shellParts(shell).frames.frameDocument = editorDocument;

        expect(shellParts(shell).commands.getContentHtml().trim()).toBe(
            `<section cms-source="/api/plans"><p>Plan</p></section>`,
        );
    });

    test("serializes composition inputs instead of generated Light DOM", async () => {
        installDom();

        const { Shell } = await import("../../../../src/exports");
        const { document: editorDocument } = parseHTML(`
            <main data-cms-content>
                <site-header ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                    <template ${COMPOSITION_INPUT_ATTRIBUTE}>
                        <span data-authored>Authored input</span>
                    </template>
                    <p9r-composition-output ${COMPOSITION_OUTPUT_ATTRIBUTE}>
                        <nav data-generated>Generated header</nav>
                    </p9r-composition-output>
                </site-header>
            </main>
        `);
        const shell = new Shell();
        document.body.append(shell);
        shellParts(shell).frames.frameDocument = editorDocument;

        const content = shellParts(shell).commands.getContentHtml();

        expect(content).toContain(`<span data-authored="">Authored input</span>`);
        expect(content).not.toContain(COMPOSITION_RUNTIME_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_INPUT_ATTRIBUTE);
        expect(content).not.toContain("data-generated");
    });

    test("syncs expanded composition Light DOM without accumulating editor runtime output", async () => {
        installDom();
        const { syncViewFrameContent } = await import(
            "../../../../src/components/Layout/Shell/Domain/Bindings/shellBindingPreview"
        );
        const { document: editorDocument } = parseHTML(`
            <main data-cms-content>
                <site-header ${COMPOSITION_RUNTIME_ATTRIBUTE}>
                    <template ${COMPOSITION_INPUT_ATTRIBUTE}><span data-authored>Input</span></template>
                    <p9r-composition-output ${COMPOSITION_OUTPUT_ATTRIBUTE}>
                        <nav data-generated>Generated</nav>
                    </p9r-composition-output>
                </site-header>
            </main>
        `);
        const { document: viewDocument } = parseHTML(`<main data-cms-content></main>`);

        syncViewFrameContent(editorDocument, viewDocument, "loading", false);
        syncViewFrameContent(editorDocument, viewDocument, "loading", false);

        const content = viewDocument.querySelector("[data-cms-content]")!.innerHTML;
        expect(content).toContain("data-generated");
        expect(content).not.toContain("data-authored");
        expect(content).not.toContain(COMPOSITION_RUNTIME_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_INPUT_ATTRIBUTE);
        expect(content).not.toContain(COMPOSITION_OUTPUT_ATTRIBUTE);
    });
});
