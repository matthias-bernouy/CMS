import {
    CMS_BINDING_ATTRIBUTES,
    CMS_BINDING_CORE_TAG,
    Editor,
    applyParamSyncSetting,
    defineTextControls,
    describe,
    dynamicDataScopes,
    expect,
    installDom,
    openDynamicDataPicker,
    paramSyncSettings,
    parseHTML,
    setShellFrameDocument,
    setShellViewFrameDocument,
    shellParts,
    shellState,
    test,
    type BlockPickerSelectDetail,
    type DataScope,
    type EditorCatalog,
    type EditorCatalogEntry,
    type EditorStructureNode,
    type StructureTreeActionDetail,
    type TopBarSourceStateChangeDetail,
    type TopBarViewportChangeDetail,
} from "../../support/shellTestSupport";

describe("Shell", () => {
    test("rich text dynamic data uses available data scopes instead of a prompt", async () => {
        installDom();

        const { RichTextEditor } = await import(
            "../../../../src/components/Controls/RichText/RichTextEditor/RichTextEditor"
        );

        const editor = new RichTextEditor();
        editor.setAttribute("label", "Rich text");
        editor.setAttribute("capability", JSON.stringify({ format: "richtext", dynamic: true }));
        editor.setAttribute(
            "data-scopes",
            JSON.stringify([
                {
                    name: "plans",
                    label: "Plans",
                    fields: [
                        { path: "title", type: "string" },
                        { path: "meta", type: "object", children: [{ path: "category", type: "string" }] },
                        { path: "items", type: "array", children: [{ path: "price", type: "number" }] },
                    ],
                },
                {
                    name: "plan",
                    label: "plan",
                    fields: [{ path: "price", type: "number" }],
                },
            ]),
        );
        document.body.append(editor);
        editor.connectedCallback();

        let prompted = false;
        const originalPrompt = window.prompt;
        window.prompt = (() => {
            prompted = true;
            return "";
        }) as typeof window.prompt;

        try {
            (editor as unknown as { runAction(action: "dynamic"): void }).runAction("dynamic");
        } finally {
            window.prompt = originalPrompt;
        }

        const picker = editor.shadowRoot!.querySelector<HTMLElement>(".data-picker")!;
        const options = Array.from(editor.shadowRoot!.querySelectorAll<HTMLButtonElement>(".data-option"));

        expect(prompted).toBe(false);
        expect(picker.hidden).toBe(false);
        expect(options.map((option) => option.dataset.path)).toEqual([
            "plans.title",
            "plans.meta.category",
            "plan.price",
        ]);
    });

    test("plain text content dynamic data inserts an interpolation at the cursor", async () => {
        installDom();
        await defineTextControls();

        const { SETTINGS_VIEW_CONTENT_CHANGE_EVENT, SettingsView } = await import(
            "../../../../src/components/Settings/SettingsView/SettingsView"
        );

        const view = new SettingsView();
        const events: Array<{ value: string; format: string }> = [];
        view.addEventListener(SETTINGS_VIEW_CONTENT_CHANGE_EVENT, (event) => {
            events.push((event as CustomEvent<{ value: string; format: string }>).detail);
        });
        document.body.append(view);

        view.setSettings(
            [],
            {
                format: "text",
                dynamic: true,
            },
            "Hello ",
            "settings",
            [],
            dynamicDataScopes,
        );

        const control = view.shadowRoot!.querySelector<HTMLElement>("cms-editor-v2-text-input")!;
        const input = control.shadowRoot!.querySelector<HTMLInputElement>("input")!;
        input.setSelectionRange?.(input.value.length, input.value.length);

        openDynamicDataPicker(control);
        control.shadowRoot!.querySelector<HTMLButtonElement>(".data-option")!.click();

        expect(input.value).toBe("Hello {{ plans.title }}");
        expect(events).toEqual([{ value: "Hello {{ plans.title }}", format: "text" }]);
    });
});
