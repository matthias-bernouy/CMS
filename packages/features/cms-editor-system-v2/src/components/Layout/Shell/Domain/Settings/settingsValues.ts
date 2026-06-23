import {
    type Editor,
    type Setting,
    type SettingSection,
} from "@bernouy/cms-content/editor";

import { isParamSyncSetting } from "./paramSync";
import { isPageStateSetting } from "./pageState";

export function resolveSettingsValues(editor: Editor, sections: SettingSection[]): SettingSection[] {
    return sections.map(section => ({
        ...section,
        settings: section.settings.map(setting => resolveSettingValue(editor, setting)),
    }));
}

export function getTextValue(editor: Editor, format: "text" | "richtext"): string {
    return format === "richtext"
        ? editor.target.innerHTML
        : editor.target.textContent ?? "";
}

function resolveSettingValue(editor: Editor, setting: Setting): Setting {
    if (isParamSyncSetting(setting) || isPageStateSetting(setting)) return setting;

    if (setting.type === "toggle") {
        return {
            ...setting,
            defaultValue: editor.target.hasAttribute(setting.attribute),
        };
    }

    return {
        ...setting,
        defaultValue: editor.target.getAttribute(setting.attribute) ?? setting.defaultValue,
    } as Setting;
}
