import { afterAll, describe, expect, test } from "bun:test";
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

describe("Shell page state bindings", () => {
    test("data source picker emits page state params", async () => {
        installDom();
        const { DATA_SOURCE_PICKER_SELECT_EVENT, DataSourcePicker } = await import(
            "../src/components/Layout/DataSourcePicker/DataSourcePicker"
        );
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

    test("data source picker renders request body schemas for action sources", async () => {
        installDom();
        const { DataSourcePicker } = await import("../src/components/Layout/DataSourcePicker/DataSourcePicker");
        const picker = new DataSourcePicker();
        document.body.append(picker);

        picker.open([
            {
                label: "Log in",
                url: "/.cms/sources/system-auth/login",
                method: "POST",
                provider: "system-auth",
                providerLabel: "Authentication",
                body: {
                    contentType: "application/json",
                    fields: [
                        { path: "email", type: "string", required: true },
                        { path: "password", type: "string", required: true },
                        { path: "returnTo", type: "string" },
                    ],
                },
                fields: [{ path: "subject", type: "object" }],
            },
        ]);

        const details = picker.shadowRoot!.querySelector<HTMLElement>(".details")!;
        const headings = Array.from(details.querySelectorAll(".details-eyebrow")).map((node) => node.textContent);
        expect(headings).toEqual(["Request body", "Response fields"]);
        expect(details.textContent).toContain("email");
        expect(details.textContent).toContain("password");
        expect(details.querySelectorAll(".field-required")).toHaveLength(2);
        expect(details.textContent).toContain("subject");
    });

    test("data source picker emits request body bindings", async () => {
        installDom();
        const { DATA_SOURCE_PICKER_SELECT_EVENT, DataSourcePicker } = await import(
            "../src/components/Layout/DataSourcePicker/DataSourcePicker"
        );
        const picker = new DataSourcePicker();
        let detail: DataSourcePickerSelectDetail | null = null;
        picker.addEventListener(DATA_SOURCE_PICKER_SELECT_EVENT, (event) => {
            detail = (event as CustomEvent<DataSourcePickerSelectDetail>).detail;
        });
        document.body.append(picker);
        picker.open([
            {
                label: "Log in",
                url: "/login",
                method: "POST",
                body: {
                    contentType: "application/json",
                    fields: [
                        { path: "email", type: "string", required: true },
                        { path: "returnTo", type: "string" },
                    ],
                },
                fields: [],
            },
        ]);

        const rows = Array.from(
            picker.shadowRoot!.querySelectorAll<HTMLElement>('.param-row[data-binding-kind="body"]'),
        );
        rows[0]!.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex = 1;
        rows[0]!.querySelector<HTMLInputElement>(".param-value")!.value = "ada@example.com";
        rows[1]!.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex = 0;
        rows[1]!.querySelector<HTMLInputElement>(".param-value")!.value = "returnTo";
        picker.shadowRoot!.querySelector<HTMLButtonElement>(".insert")!.click();

        expect(detail?.binding).toEqual({
            url: "/login",
            alias: "data",
            method: "POST",
            trigger: "submit",
            body: {
                email: { from: "raw", value: "ada@example.com" },
                returnTo: { from: "queryParam", name: "returnTo" },
            },
        });
    });

    test("data source picker only binds top-level scalar request body fields", async () => {
        installDom();
        const { DataSourcePicker } = await import("../src/components/Layout/DataSourcePicker/DataSourcePicker");
        const picker = new DataSourcePicker();
        document.body.append(picker);
        picker.open([
            {
                label: "Create customer",
                url: "/customers",
                method: "POST",
                body: {
                    contentType: "application/json",
                    fields: [
                        { path: "email", type: "string", required: true },
                        {
                            path: "profile",
                            type: "object",
                            children: [{ path: "firstName", type: "string" }],
                        },
                        {
                            path: "items",
                            type: "array",
                            children: [{ path: "sku", type: "string" }],
                        },
                    ],
                },
                fields: [],
            },
        ]);

        const bodyRows = Array.from(
            picker.shadowRoot!.querySelectorAll<HTMLElement>('.param-row[data-binding-kind="body"]'),
        );
        expect(bodyRows.map((row) => row.dataset.paramName)).toEqual(["email"]);
        expect(picker.shadowRoot!.querySelector<HTMLElement>(".details")!.textContent).toContain("firstName");
        expect(picker.shadowRoot!.querySelector<HTMLElement>(".details")!.textContent).toContain("sku");
    });

    test("data source picker pre-fills request body bindings", async () => {
        installDom();
        const { DataSourcePicker } = await import("../src/components/Layout/DataSourcePicker/DataSourcePicker");
        const picker = new DataSourcePicker();
        document.body.append(picker);
        picker.open(
            [
                {
                    label: "Log in",
                    url: "/login",
                    method: "POST",
                    body: {
                        contentType: "application/json",
                        fields: [{ path: "token", type: "string" }],
                    },
                    fields: [],
                },
            ],
            undefined,
            {
                initialBinding: {
                    url: "/login",
                    method: "POST",
                    body: { token: { from: "state", name: "auth.token" } },
                },
            },
        );

        const row = picker.shadowRoot!.querySelector<HTMLElement>('.param-row[data-binding-kind="body"]')!;
        expect(row.querySelector<HTMLSelectElement>(".param-mode")!.selectedIndex).toBe(2);
        expect(row.querySelector<HTMLInputElement>(".param-value")!.value).toBe("auth.token");
    });

    test("page state settings write and validate cms-page-state", () => {
        installDom();
        const input = document.createElement("input");
        input.setAttribute("name", "address");
        const editor = new Editor(input);

        expect(pageStateSettings(editor)?.settings.map((setting) => [setting.attribute, setting.defaultValue])).toEqual(
            [[PAGE_STATE_ENABLE_SETTING, false]],
        );

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
        expect(pageStateSettings(editor)?.settings.map((setting) => [setting.attribute, setting.defaultValue])).toEqual(
            [
                [PAGE_STATE_ENABLE_SETTING, true],
                [PAGE_STATE_USE_NAME_SETTING, false],
                [PAGE_STATE_NAME_SETTING, ""],
            ],
        );

        applyPageStateSetting(editor, { attribute: PAGE_STATE_NAME_SETTING }, "delivery.address");
        expect(input.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)).toBe("delivery.address");
    });
});
