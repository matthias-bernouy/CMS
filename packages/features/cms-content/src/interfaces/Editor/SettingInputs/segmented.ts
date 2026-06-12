import type { SettingMetadata, SettingOption } from "./base";

export type SegmentedSetting = SettingMetadata<"segmented", string> & {
    options: SettingOption[];
};
