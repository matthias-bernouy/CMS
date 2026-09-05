import type { Setting, SettingSection } from "@bernouy/cms-content/editor";

export function markManagedNativeSection(section: SettingSection): SettingSection {
    return {
        ...section,
        settings: section.settings.map(markManagedNativeSetting),
    };
}

function markManagedNativeSetting(setting: Setting): Setting {
    if (setting.type === "row") {
        return {
            ...setting,
            settings: setting.settings.map((child) => ({ ...child, target: "managed-native" })),
        };
    }
    return { ...setting, target: "managed-native" };
}
