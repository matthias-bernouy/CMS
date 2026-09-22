import type { SettingMetadata, SettingOption } from "cms-content/editor/interfaces/SettingInputs/base";

export type ColorSetting = SettingMetadata<"color", string> & {
    tokens?: SettingOption[];
    allowCustom?: boolean;
    customAttribute?: string;
    customDefaultValue?: string;
};
