import type { SettingMetadata, SettingOption } from "cms-content/editor/interfaces/SettingInputs/base";

export type SelectSetting = SettingMetadata<"select", string> & {
    options: SettingOption[];
};
