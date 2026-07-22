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
    test("data source picker pre-fills request body bindings", async () => {
        installDom();
        const { DataSourcePicker } = await import(
            "../../../../src/components/Layout/Pickers/DataSourcePicker/DataSourcePicker"
        );
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
