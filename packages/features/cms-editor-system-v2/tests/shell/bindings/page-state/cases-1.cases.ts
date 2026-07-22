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
    test("data source picker emits page state params", async () => {
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
        const { DataSourcePicker } = await import(
            "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker"
        );
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
        const { DataSourcePicker } = await import(
            "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker"
        );
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
});
