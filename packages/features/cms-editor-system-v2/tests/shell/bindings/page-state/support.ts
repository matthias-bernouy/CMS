import { afterAll, describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, Editor } from "@bernouy/cms-content/editor";
import type { DataSourcePickerSelectDetail } from "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker";
import {
    applyPageStateSetting,
    PAGE_STATE_ENABLE_SETTING,
    PAGE_STATE_NAME_SETTING,
    PAGE_STATE_USE_NAME_SETTING,
    pageStateSettings,
} from "../../../../src/components/Layout/Shell/Domain/Settings/pageState";
import type { EditorDataSource } from "../../../../src/runtime";

function installDom(): void {
    const { document, customElements, Element, HTMLElement, CustomEvent, Event, Node } = parseHTML(
        "<!DOCTYPE html><html><body></body></html>",
    );
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

function dataSource(): EditorDataSource {
    return {
        label: "Delivery options",
        url: "/api/delivery",
        method: "GET",
        fields: [],
        params: [{ name: "address", in: "query", type: "string" }],
    };
}

export {
    CMS_BINDING_ATTRIBUTES,
    Editor,
    PAGE_STATE_ENABLE_SETTING,
    PAGE_STATE_NAME_SETTING,
    PAGE_STATE_USE_NAME_SETTING,
    applyPageStateSetting,
    dataSource,
    describe,
    expect,
    installDom,
    pageStateSettings,
    test,
};
export type { DataSourcePickerSelectDetail, EditorDataSource };
