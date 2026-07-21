import {
    CMS_BINDING_ATTRIBUTES,
    type Editor,
    type Setting,
    type SettingControl,
    type SettingSection,
} from "@bernouy/cms-content/editor";
import { hasStandardValueSurface, isValidValueKey, valueSurfaceName } from "./valueSurface";

export const PAGE_STATE_ENABLE_SETTING = "__cms-page-state-enabled";
export const PAGE_STATE_USE_NAME_SETTING = "__cms-page-state-use-name";
export const PAGE_STATE_NAME_SETTING = "__cms-page-state-name";

export function applyPageStateSetting(
    editor: Editor,
    setting: Pick<SettingControl, "attribute">,
    value: string | boolean,
): boolean {
    if (!isPageStateSetting(setting)) {
        return false;
    }

    const target = editor.target;
    const current = target.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)?.trim() ?? "";
    const fieldName = valueSurfaceName(target);

    if (setting.attribute === PAGE_STATE_ENABLE_SETTING) {
        if (value !== true) {
            target.removeAttribute(CMS_BINDING_ATTRIBUTES.pageState);
            return true;
        }
        const next = current || fieldName;
        if (isValidValueKey(next)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.pageState, next);
        }
        return true;
    }

    if (setting.attribute === PAGE_STATE_USE_NAME_SETTING) {
        if (value === true && isValidValueKey(fieldName)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.pageState, fieldName);
        } else if (current === fieldName) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.pageState, "");
        }
        return true;
    }

    if (typeof value === "string") {
        const next = value.trim();
        if (isValidValueKey(next)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.pageState, next);
        }
    }

    return true;
}

export function settingsWithPageState(editor: Editor, sections: SettingSection[]): SettingSection[] {
    const section = pageStateSettings(editor);
    return section ? [...sections, section] : sections;
}

export function pageStateSettings(editor: Editor): SettingSection | null {
    const target = editor.target;
    if (!hasStandardValueSurface(target)) {
        return null;
    }

    const hasSyncAttribute = target.hasAttribute(CMS_BINDING_ATTRIBUTES.pageState);
    const syncValue = target.getAttribute(CMS_BINDING_ATTRIBUTES.pageState)?.trim() ?? "";
    const fieldName = valueSurfaceName(target);
    const hasFieldName = isValidValueKey(fieldName);
    const isEnabled = hasSyncAttribute;
    const usesFieldName = isEnabled && hasFieldName && syncValue === fieldName;
    const settings: Setting[] = [
        {
            type: "toggle",
            label: "Sync with page state",
            attribute: PAGE_STATE_ENABLE_SETTING,
            defaultValue: isEnabled,
        },
    ];

    if (isEnabled && hasFieldName) {
        settings.push({
            type: "toggle",
            label: "Use field name",
            attribute: PAGE_STATE_USE_NAME_SETTING,
            defaultValue: usesFieldName,
            help: `Uses "${fieldName}" as the page state key.`,
        });
    }

    if (isEnabled && !usesFieldName) {
        settings.push({
            type: "text",
            label: "State key",
            attribute: PAGE_STATE_NAME_SETTING,
            defaultValue: syncValue,
            placeholder: hasFieldName ? fieldName : "deliveryAddress",
            help: "Letters, numbers, underscores, dashes and dots only.",
            required: true,
        });
    }

    return { kind: "surcharge", label: "Page state", settings };
}

export function isPageStateSetting(setting: Pick<SettingControl, "attribute">): boolean {
    return (
        setting.attribute === PAGE_STATE_ENABLE_SETTING ||
        setting.attribute === PAGE_STATE_USE_NAME_SETTING ||
        setting.attribute === PAGE_STATE_NAME_SETTING
    );
}
