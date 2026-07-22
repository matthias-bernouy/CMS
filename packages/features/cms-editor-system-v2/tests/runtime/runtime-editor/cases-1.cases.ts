import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    CMS_EDITOR_STATES_CHANGE_EVENT,
    CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT,
    EditorRegistry,
    LifecycleEditor,
    RuntimeEditor,
    createDocument,
    describe,
    expect,
    parseHTML,
    test,
    type ContentSlot,
    type DataScope,
    type EditableState,
    type RuntimeEditorContentSlotsChangeDetail,
    type RuntimeEditorDataScopesChangeDetail,
    type RuntimeEditorSettingsChangeDetail,
    type RuntimeEditorStatesChangeDetail,
    type RuntimeEditorTextCapabilityChangeDetail,
    type SettingSection,
} from "./support";

describe("RuntimeEditor", () => {
    test("registers editors and resolves direct editor children", () => {
        const document = createDocument();
        const registry = new EditorRegistry();

        const parent = new RuntimeEditor(document.getElementById("parent")!, registry);
        const directChild = new RuntimeEditor(document.getElementById("direct-child")!, registry);
        const nestedChild = new RuntimeEditor(document.getElementById("nested-child")!, registry);
        const siblingChild = new RuntimeEditor(document.getElementById("sibling-child")!, registry);

        expect(registry.getEditor(parent.target)).toBe(parent);
        expect(parent.getChildren()).toEqual([directChild, siblingChild]);
        expect(directChild.getChildren()).toEqual([nestedChild]);
        expect(nestedChild.getChildren()).toEqual([]);
    });

    test("adds runtime settings and emits a settings-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        const gridOverride: SettingSection = {
            kind: "surcharge",
            label: "Grid",
            settings: [
                {
                    type: "select",
                    label: "Columns",
                    attribute: "cms-grid-columns",
                    options: [
                        { label: "1 column", value: "1" },
                        { label: "2 columns", value: "2" },
                    ],
                },
            ],
        };

        let eventDetail: RuntimeEditorSettingsChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_SETTINGS_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorSettingsChangeDetail>).detail;
        });

        editor.addSettings(gridOverride);

        expect(editor.getSettings()).toEqual([gridOverride]);
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.settings).toEqual([gridOverride]);
    });

    test("declares data scopes and emits a data-scopes-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("parent")!, registry);
        const scope: DataScope = {
            name: "plans",
            label: "Plans",
            source: "urn:test:plans",
            fields: [
                { path: "name", type: "string" },
                { path: "price", type: "number" },
            ],
        };

        let eventDetail: RuntimeEditorDataScopesChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorDataScopesChangeDetail>).detail;
        });

        editor.declareDataScope(scope);

        expect(editor.getDataScopes()).toEqual([scope]);
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.dataScopes).toEqual([scope]);
    });

    test("adds runtime content slots and emits a content-slots-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        const slot: ContentSlot = {
            label: "Actions",
            min: 1,
            accepts: [{ kind: "component", tag: "button" }],
        };

        let eventDetail: RuntimeEditorContentSlotsChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorContentSlotsChangeDetail>).detail;
        });

        editor.addContentSlots(slot);

        expect(editor.getContentSlots()).toEqual([slot]);
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.contentSlots).toEqual([slot]);
    });

    test("overrides text capability and emits a text-capability-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        let eventDetail: RuntimeEditorTextCapabilityChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorTextCapabilityChangeDetail>).detail;
        });

        editor.setTextCapability({ format: "text", dynamic: true });

        expect(editor.getTextCapability()).toEqual({ format: "text", dynamic: true });
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.textCapability).toEqual({ format: "text", dynamic: true });
    });
});
