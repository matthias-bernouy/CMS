import type { SettingLabelDisplay, SettingVisibilityRule } from "./base";
import type { ColorSetting } from "./color";
import type { EndpointPickerSetting } from "./endpointPicker";
import type { PageLinkSetting } from "./pageLink";
import type { SegmentedSetting } from "./segmented";
import type { SelectSetting } from "./select";
import type { TextareaSetting } from "./textarea";
import type { TextSetting } from "./text";
import type { ToggleSetting } from "./toggle";

type RowSettingControl =
    | TextSetting
    | TextareaSetting
    | SelectSetting
    | ToggleSetting
    | SegmentedSetting
    | PageLinkSetting
    | EndpointPickerSetting
    | ColorSetting;

export type SettingRow = {
    type: "row";
    label?: string;
    labelDisplay?: SettingLabelDisplay;
    settings: RowSettingControl[];
    visibleWhen?: SettingVisibilityRule | SettingVisibilityRule[];
};
