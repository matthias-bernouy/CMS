import type { SettingMetadata, SettingOption } from "./base";

export type SelectSetting = SettingMetadata<"select", string> & {
    options: SettingOption[];
};
