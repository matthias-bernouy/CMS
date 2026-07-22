import { afterAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { DataScope } from "@bernouy/cms-content/editor";
import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG, Editor } from "@bernouy/cms-content/editor";
import {
    applyParamSyncSetting,
    paramSyncSettings,
} from "../../../src/components/Layout/Shell/Domain/Settings/paramSync";
import type { ShellControllerParts } from "../../../src/components/Layout/Shell/Controller/Core/Services/shellControllerParts";
import type { ShellState } from "../../../src/components/Layout/Shell/Controller/Core/Services/shellState";

export { describe, expect, parseHTML, test };
export type { DataScope, EditorCatalog, EditorCatalogEntry } from "@bernouy/cms-content/editor";
export { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG, Editor };
export type { BlockPickerSelectDetail } from "../../../src/components/Layout/Pickers/BlockPickerModal/BlockPickerModal";
export type { StructureTreeActionDetail } from "../../../src/components/Layout/StructureTree/StructureTree";
export type {
    TopBarSourceStateChangeDetail,
    TopBarViewportChangeDetail,
} from "../../../src/components/Layout/TopBar/TopBar";
export { applyParamSyncSetting, paramSyncSettings };
export type { EditorStructureNode } from "../../../src/runtime";

export function shellParts(shell: unknown): ShellControllerParts {
    return (shell as { _parts: ShellControllerParts })._parts;
}

export function shellState(shell: unknown): ShellState {
    return shellParts(shell).state;
}

export function setShellFrameDocument(shell: unknown, document: Document): void {
    shellParts(shell).frames.frameDocument = document;
}

export function setShellViewFrameDocument(shell: unknown, document: Document): void {
    shellParts(shell).frames.viewFrameDocument = document;
}

export function installDom(): void {
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

export const dynamicDataScopes: DataScope[] = [
    {
        name: "plans",
        label: "Plans",
        fields: [
            { path: "title", type: "string" },
            { path: "meta", type: "object", children: [{ path: "category", type: "string" }] },
        ],
    },
];

export async function defineTextControls(): Promise<void> {
    const { TextInput } = await import("../../../src/components/Controls/Fields/TextInput/TextInput");
    const { Textarea } = await import("../../../src/components/Controls/Fields/Textarea/Textarea");
    class TestTextInput extends TextInput {}
    class TestTextarea extends Textarea {}

    if (!customElements.get("cms-editor-v2-text-input")) {
        customElements.define("cms-editor-v2-text-input", TestTextInput);
    }
    if (!customElements.get("cms-editor-v2-textarea")) {
        customElements.define("cms-editor-v2-textarea", TestTextarea);
    }
}

export function openDynamicDataPicker(control: HTMLElement): void {
    control
        .shadowRoot!.querySelector<HTMLButtonElement>(".dynamic-data-tool")!
        .dispatchEvent(new Event("pointerdown", { bubbles: true, cancelable: true }));
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
