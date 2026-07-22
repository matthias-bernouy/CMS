import { afterAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import { COMPOSITION_INPUT_ATTRIBUTE, COMPOSITION_RUNTIME_ATTRIBUTE } from "@bernouy/components/composition-runtime";

import type { ShellControllerParts } from "../../../../src/components/Layout/Shell/Controller/Core/Services/shellControllerParts";

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

const workspaceDomGlobals = {
    document: globalThis.document,
    customElements: globalThis.customElements,
    Element: globalThis.Element,
    HTMLElement: globalThis.HTMLElement,
    CustomEvent: globalThis.CustomEvent,
    Event: globalThis.Event,
    Node: globalThis.Node,
    requestAnimationFrame: globalThis.requestAnimationFrame,
};

afterAll(() => {
    Object.assign(globalThis, workspaceDomGlobals);
});

function shellParts(shell: unknown): ShellControllerParts {
    return (shell as { _parts: ShellControllerParts })._parts;
}

function frameDetail(kind: "editor" | "view", document: Document) {
    return {
        kind,
        document,
        frame: globalThis.document.createElement("iframe"),
        url: "/frame",
    };
}

export {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    COMPOSITION_INPUT_ATTRIBUTE,
    COMPOSITION_RUNTIME_ATTRIBUTE,
    describe,
    expect,
    frameDetail,
    installDom,
    parseHTML,
    shellParts,
    test,
};
