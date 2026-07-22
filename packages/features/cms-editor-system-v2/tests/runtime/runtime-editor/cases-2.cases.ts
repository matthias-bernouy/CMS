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
    test("adds runtime editable states and emits a states-change event", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);
        let active = false;
        const state: EditableState = {
            id: "menu-open",
            label: "Menu open",
            isActive() {
                return active;
            },
            enter() {
                active = true;
                return {
                    exit() {
                        active = false;
                    },
                };
            },
        };

        let eventDetail: RuntimeEditorStatesChangeDetail | undefined;
        editor.target.addEventListener(CMS_EDITOR_STATES_CHANGE_EVENT, (event) => {
            eventDetail = (event as CustomEvent<RuntimeEditorStatesChangeDetail>).detail;
        });

        editor.addStates(state);

        expect(editor.getStates()).toEqual([state]);
        expect(eventDetail?.editor).toBe(editor);
        expect(eventDetail?.states).toEqual([state]);

        const session = state.enter();
        expect(state.isActive()).toBe(true);
        session.exit();
        expect(state.isActive()).toBe(false);
    });

    test("collects data scopes from ancestor editors and the target editor", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const parent = new RuntimeEditor(document.getElementById("parent")!, registry);
        const directChild = new RuntimeEditor(document.getElementById("direct-child")!, registry);
        const nestedChild = new RuntimeEditor(document.getElementById("nested-child")!, registry);

        const parentScope: DataScope = {
            name: "site",
            fields: [{ path: "title", type: "string" }],
        };
        const childScope: DataScope = {
            name: "plans",
            fields: [{ path: "name", type: "string" }],
        };
        const nestedScope: DataScope = {
            name: "selection",
            fields: [{ path: "active", type: "boolean" }],
        };

        parent.declareDataScope(parentScope);
        directChild.declareDataScope(childScope);
        nestedChild.declareDataScope(nestedScope);

        expect(registry.getAncestors(nestedChild.target)).toEqual([parent, directChild]);
        expect(registry.collectDataScopes(nestedChild.target)).toEqual([parentScope, childScope, nestedScope]);
    });

    test("unregisters disposed editors", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new RuntimeEditor(document.getElementById("direct-child")!, registry);

        editor.dispose();

        expect(registry.getEditor(editor.target)).toBeUndefined();
    });

    test("runs stable editor lifecycle hooks idempotently", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new LifecycleEditor(document.getElementById("direct-child")!, registry);

        editor.mount();
        editor.mount();
        expect(editor.mounted).toBe(1);

        editor.unmount();
        editor.unmount();
        expect(editor.unmounted).toBe(1);
    });

    test("unmounts before unregistering on dispose", () => {
        const document = createDocument();
        const registry = new EditorRegistry();
        const editor = new LifecycleEditor(document.getElementById("direct-child")!, registry);

        editor.mount();
        editor.dispose();

        expect(editor.unmounted).toBe(1);
        expect(registry.getEditor(editor.target)).toBeUndefined();
    });
});
