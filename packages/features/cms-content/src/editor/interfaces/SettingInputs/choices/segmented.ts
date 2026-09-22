import type { SettingMetadata, SettingOption } from "cms-content/editor/interfaces/SettingInputs/base";

export type SegmentedSetting = SettingMetadata<"segmented", string> & {
    options: SettingOption[];
};
