import {
    CMS_BINDING_ATTRIBUTES,
    type Setting,
    type SettingControl,
    type SettingSection,
    type Editor,
} from "@bernouy/cms-content/editor";
import { hasStandardValueSurface, isValidValueKey, valueSurfaceName } from "./valueSurface";

export const PARAM_SYNC_ENABLE_SETTING = "__cms-param-sync-enabled";
export const PARAM_SYNC_USE_NAME_SETTING = "__cms-param-sync-use-name";
export const PARAM_SYNC_NAME_SETTING = "__cms-param-sync-name";

export function applyParamSyncSetting(
    editor: Editor,
    setting: Pick<SettingControl, "attribute">,
    value: string | boolean,
): boolean {
    if (!isParamSyncSetting(setting)) {
        return false;
    }

    const target = editor.target;
    const current = target.getAttribute(CMS_BINDING_ATTRIBUTES.paramSync)?.trim() ?? "";
    const fieldName = valueSurfaceName(target);

    if (setting.attribute === PARAM_SYNC_ENABLE_SETTING) {
        if (value !== true) {
            target.removeAttribute(CMS_BINDING_ATTRIBUTES.paramSync);
            return true;
        }

        const next = current || fieldName;
        if (isValidValueKey(next)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.paramSync, next);
        }
        return true;
    }

    if (setting.attribute === PARAM_SYNC_USE_NAME_SETTING) {
        if (value === true && isValidValueKey(fieldName)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.paramSync, fieldName);
        } else if (current === fieldName) {
            target.removeAttribute(CMS_BINDING_ATTRIBUTES.paramSync);
        }
        return true;
    }

    if (typeof value === "string") {
        const next = value.trim();
        if (isValidValueKey(next)) {
            target.setAttribute(CMS_BINDING_ATTRIBUTES.paramSync, next);
        }
    }

    return true;
}

export function settingsWithParamSync(editor: Editor, sections: SettingSection[]): SettingSection[] {
    const section = paramSyncSettings(editor);
    return section ? [...sections, section] : sections;
}

export function paramSyncSettings(editor: Editor): SettingSection | null {
    const target = editor.target;
    if (!hasStandardValueSurface(target)) {
        return null;
    }

    const syncValue = target.getAttribute(CMS_BINDING_ATTRIBUTES.paramSync)?.trim() ?? "";
    const fieldName = valueSurfaceName(target);
    const hasFieldName = isValidValueKey(fieldName);
    const isEnabled = syncValue !== "";
    const usesFieldName = isEnabled && hasFieldName && syncValue === fieldName;
    const settings: Setting[] = [
        {
            type: "toggle",
            label: "Sync with query params",
            attribute: PARAM_SYNC_ENABLE_SETTING,
            defaultValue: isEnabled,
        },
    ];

    if (isEnabled && hasFieldName) {
        settings.push({
            type: "toggle",
            label: "Use field name",
            attribute: PARAM_SYNC_USE_NAME_SETTING,
            defaultValue: usesFieldName,
            help: `Uses "${fieldName}" as the query parameter name.`,
        });
    }

    if (isEnabled && !usesFieldName) {
        settings.push({
            type: "text",
            label: "Param name",
            attribute: PARAM_SYNC_NAME_SETTING,
            defaultValue: syncValue,
            placeholder: hasFieldName ? fieldName : "search",
            help: "Letters, numbers, underscores, dashes and dots only.",
            required: true,
        });
    }

    return {
        kind: "surcharge",
        label: "Query params",
        settings,
    };
}

export function isParamSyncSetting(setting: Pick<SettingControl, "attribute">): boolean {
    return (
        setting.attribute === PARAM_SYNC_ENABLE_SETTING ||
        setting.attribute === PARAM_SYNC_USE_NAME_SETTING ||
        setting.attribute === PARAM_SYNC_NAME_SETTING
    );
}
