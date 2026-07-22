import type { SettingLabelDisplay, SettingVisibilityRule } from "./base";
import type { ColorSetting } from "./choices/color";
import type { EndpointPickerSetting } from "./references/endpointPicker";
import type { PageLinkSetting } from "./references/pageLink";
import type { SegmentedSetting } from "./choices/segmented";
import type { SelectSetting } from "./choices/select";
import type { TextareaSetting } from "./textual/textarea";
import type { TextSetting } from "./textual/text";
import type { ToggleSetting } from "./choices/toggle";

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
