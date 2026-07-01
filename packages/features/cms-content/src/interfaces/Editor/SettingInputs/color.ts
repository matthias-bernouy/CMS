import type { SettingMetadata, SettingOption } from "./base";

export type ColorSetting = SettingMetadata<"color", string> & {
    tokens?: SettingOption[];
    allowCustom?: boolean;
    customAttribute?: string;
    customDefaultValue?: string;
};
