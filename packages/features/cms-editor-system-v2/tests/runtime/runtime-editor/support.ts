import { describe, expect, test } from "bun:test";
import { parseHTML } from "linkedom";
import type { ContentSlot, DataScope, EditableState, SettingSection } from "@bernouy/cms-content/editor";
import {
    CMS_EDITOR_CONTENT_SLOTS_CHANGE_EVENT,
    CMS_EDITOR_DATA_SCOPES_CHANGE_EVENT,
    CMS_EDITOR_SETTINGS_CHANGE_EVENT,
    CMS_EDITOR_STATES_CHANGE_EVENT,
    CMS_EDITOR_TEXT_CAPABILITY_CHANGE_EVENT,
    EditorRegistry,
    RuntimeEditor,
    type RuntimeEditorContentSlotsChangeDetail,
    type RuntimeEditorDataScopesChangeDetail,
    type RuntimeEditorSettingsChangeDetail,
    type RuntimeEditorStatesChangeDetail,
    type RuntimeEditorTextCapabilityChangeDetail,
} from "../../../src/runtime";

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

export {
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
};
export type {
    ContentSlot,
    DataScope,
    EditableState,
    RuntimeEditorContentSlotsChangeDetail,
    RuntimeEditorDataScopesChangeDetail,
    RuntimeEditorSettingsChangeDetail,
    RuntimeEditorStatesChangeDetail,
    RuntimeEditorTextCapabilityChangeDetail,
    SettingSection,
};
