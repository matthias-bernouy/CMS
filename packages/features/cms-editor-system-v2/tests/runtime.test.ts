import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type {
    ContentSlot,
    DataScope,
    SettingSection,
} from "@bernouy/cms-content/editor";
import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    EditorRegistry,
    RuntimeEditor,
    type RuntimeEditorContentSlotsChangeDetail,
    type RuntimeEditorDataScopesChangeDetail,
    type RuntimeEditorSettingsChangeDetail,
} from "../src/runtime";

function createDocument() {
    return parseHTML(`
        <!DOCTYPE html>
        <html>
            <body>
                <section id="parent">
                    <article id="direct-child">
                        <button id="nested-child"></button>
                    </article>
                    <aside id="sibling-child"></aside>
                </section>
            </body>
        </html>
    `).document;
}

class LifecycleEditor extends RuntimeEditor {
    mounted = 0;
    unmounted = 0;

    override mountEditor(): void {
        this.mounted++;
    }

    override unmountEditor(): void {
        this.unmounted++;
    }
}

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
            label: "Content",
            min: 1,
            accepts: [{ kind: "richtext" }],
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
        expect(registry.collectDataScopes(nestedChild.target)).toEqual([
            parentScope,
            childScope,
            nestedScope,
        ]);
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
