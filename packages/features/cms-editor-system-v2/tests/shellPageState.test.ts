import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import { CMS_BINDING_ATTRIBUTES, Editor } from "@bernouy/cms-content/editor";
import type { DataSourcePickerSelectDetail } from "../src/components/Layout/DataSourcePicker/DataSourcePicker";
import {
    applyPageStateSetting,
    PAGE_STATE_ENABLE_SETTING,
    PAGE_STATE_NAME_SETTING,
    PAGE_STATE_USE_NAME_SETTING,
    pageStateSettings,
} from "../src/components/Layout/Shell/Domain/Settings/pageState";
import type { EditorDataSource } from "../src/runtime";

function installDom(): void {
    const { document, customElements, Element, HTMLElement, CustomEvent, Event, Node } = parseHTML("<!DOCTYPE html><html><body></body></html>");
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

function dataSource(): EditorDataSource {
    return {
        label: "Delivery options",
        url: "/api/delivery",
        method: "GET",
        fields: [],
        params: [{ name: "address", in: "query", type: "string" }],
    };
}

describe("Shell page state bindings", () => {
    test("data source picker emits page state params", async () => {
        installDom();
        const {
            DATA_SOURCE_PICKER_SELECT_EVENT,
            DataSourcePicker,
        } = await import("../src/components/Layout/DataSourcePicker/DataSourcePicker");
        const picker = new DataSourcePicker();
        let detail: DataSourcePickerSelectDetail | null = null;
        picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, (event) => {
            detail = (event as CustomEvent<DataSourcePickerSelectDetail>).detail;
        });
        document.body.append(picker);
        picker.open([dataSource()]);

        const row = picker.shadowRoot!.querySelector<HTMLElement>(".param-row")!;
        row.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex = 2;
        row.querySelector<HTMLInputElement>(".param-value")!.value = "deliveryAddress";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail?.binding).toEqual({
            url: "/api/delivery",
            alias: "data",
            params: { address: { from: "state", name: "deliveryAddress" } },
        });
    });

    test("data source picker pre-fills page state params from cms-source", async () => {
        installDom();
        const { DataSourcePicker } = await import("../src/components/Layout/DataSourcePicker/DataSourcePicker");
        const picker = new DataSourcePicker();
        document.body.append(picker);
        picker.open([dataSource()], undefined, {
            initialBinding: { url: "/api/delivery?address=@{delivery.address}" },
        });

        const row = picker.shadowRoot!.querySelector<HTMLElement>(".param-row")!;
        expect(row.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex).toBe(2);
        expect(row.querySelector<HTMLInputElement>(".param-value")!.value).toBe("delivery.address");
    });

    test("page state settings write and validate cms-page-state", () => {
        installDom();
        const input = document.createElement("input");
        input.setAttribute("name", "address");
        const editor = new Editor(input);

        expect(pageStateSettings(editor)?.settings.map(setting => [setting.attribute, setting.defaultValue]))
            .toEqual([[PAGE_STATE_ENABLE_SETTING, false]]);

        applyPageStateSetting(editor, { attribute: PAGE_STATE_ENABLE_SETTING }, true);
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("address");

        applyPageStateSetting(editor, { attribute: PAGE_STATE_NAME_SETTING }, "bad name");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("address");

        applyPageStateSetting(editor, { attribute: PAGE_STATE_NAME_SETTING }, "delivery.address");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("delivery.address");
    });

    test("page state settings keep custom key mode reachable", () => {
        installDom();
        const input = document.createElement("input");
        input.setAttribute("name", "address");
        const editor = new Editor(input);

        applyPageStateSetting(editor, { attribute: PAGE_STATE_ENABLE_SETTING }, true);
        applyPageStateSetting(editor, { attribute: PAGE_STATE_USE_NAME_SETTING }, false);

        expect(input.hasAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe(true);
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("");
        expect(pageStateSettings(editor)?.settings.map(setting => [setting.attribute, setting.defaultValue]))
            .toEqual([
                [PAGE_STATE_ENABLE_SETTING, true],
                [PAGE_STATE_USE_NAME_SETTING, false],
                [PAGE_STATE_NAME_SETTING, ""],
            ]);

        applyPageStateSetting(editor, { attribute: PAGE_STATE_NAME_SETTING }, "delivery.address");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("delivery.address");
    });
});
