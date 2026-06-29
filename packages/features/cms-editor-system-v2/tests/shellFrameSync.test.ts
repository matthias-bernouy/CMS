import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";

import type { ShellControllerParts } from "../src/components/Layout/Shell/Controller/Core/Services/shellControllerParts";

function installDom(): void {
    const { document, customElements, Element, HTMLElement, CustomEvent, Event, Node } = parseHTML(`
        <!DOCTYPE html>
        <html>
            <body></body>
        </html>
    `);

    Object.assign(globalThis, {
        document,
        customElements,
        Element,
        HTMLElement,
        CustomEvent,
        Event,
        Node,
        requestAnimationFrame: (callback: FrameRequestCallback) => setTimeout(callback, 0),
    });
}

function shellParts(shell: unknown): ShellControllerParts {
    return (shell as { _parts: ShellControllerParts })._parts;
}

function frameDetail(kind: "editor" | "view", document: Document) {
    return {
        kind,
        document,
        frame: globalThis.document.createElement("iframe"),
        url:   "/frame",
    };
}

describe("Shell frame binding sync", () => {
    test("syncs the view frame when the editor frame becomes ready after it", async () => {
        installDom();

        const { Shell } = await import("../src/exports");
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

        expect(viewDocument.querySelector("[data-cms-content]")?.innerHTML)
            .toBe(`<section cms-source="/api/plans"><p>{{ plan.name }}</p></section>`);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.bindingDisabled)).toBe(false);
        expect(viewCore.hasAttribute(CMS_BINDING_ATTRIBUTES.sourceStateForce)).toBe(false);
        expect(calls).toEqual(["stop", "start"]);
    });

    test("does not serialize binding runtime stamps", async () => {
        installDom();

        const { Shell } = await import("../src/exports");
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

        expect(shellParts(shell).commands.getContentHtml().trim())
            .toBe(`<section cms-source="/api/plans"><p>Plan</p></section>`);
    });

    test("restores view source templates before restarting runtime", async () => {
        installDom();

        const { restartViewBindingRuntime } = await import("../src/components/Layout/Shell/Domain/shellBindingPreview");
        const { document: viewDocument } = parseHTML(`
            <div data-cms-editor-root>
                <${CMS_BINDING_CORE_TAG}>
                    <main data-cms-content>
                        <section cms-source="/api/plans"><base-skeleton shape="rect"></base-skeleton></section>
                    </main>
                </${CMS_BINDING_CORE_TAG}>
            </div>
        `);
        const source = viewDocument.querySelector("[cms-source]")!;
        const core = viewDocument.querySelector(CMS_BINDING_CORE_TAG) as HTMLElement & {
            runtime?: { stop(): void; deactivate(): void } | null;
            startRuntime?: () => void;
        };
        const calls: string[] = [];
        let captured = "";
        core.runtime = {
            deactivate: () => {
                calls.push("deactivate");
                source.innerHTML = `<p cms-repeat="data as data">{{ data.label }}</p><base-skeleton shape="rect" cms-condition="$source.loading"></base-skeleton>`;
            },
            stop: () => calls.push("stop"),
        };
        core.startRuntime = () => {
            calls.push("start");
            captured = source.innerHTML;
        };

        restartViewBindingRuntime(viewDocument);

        expect(calls).toEqual(["deactivate", "start"]);
        expect(captured).toContain(`cms-repeat="data as data"`);
        expect(captured).toContain(`cms-condition="$source.loading"`);
    });
});
