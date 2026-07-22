import {
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
    type DataSourcePickerSelectDetail,
    type EditorDataSource,
} from "./support";

describe("Shell page state bindings", () => {
    test("data source picker emits request body bindings", async () => {
        installDom();
        const { DATA_SOURCE_PICKER_SELECT_EVENT, DataSourcePicker } = await import(
            "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker"
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
        const { DataSourcePicker } = await import(
            "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker"
        );
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
});
