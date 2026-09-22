import type { SettingLabelDisplay, SettingVisibilityRule } from "cms-content/editor/interfaces/SettingInputs/base";
import type { ColorSetting } from "cms-content/editor/interfaces/SettingInputs/choices/color";
import type { EndpointPickerSetting } from "cms-content/editor/interfaces/SettingInputs/references/endpointPicker";
import type { PageLinkSetting } from "cms-content/editor/interfaces/SettingInputs/references/pageLink";
import type { SegmentedSetting } from "cms-content/editor/interfaces/SettingInputs/choices/segmented";
import type { SelectSetting } from "cms-content/editor/interfaces/SettingInputs/choices/select";
import type { TextareaSetting } from "cms-content/editor/interfaces/SettingInputs/textual/textarea";
import type { TextSetting } from "cms-content/editor/interfaces/SettingInputs/textual/text";
import type { ToggleSetting } from "cms-content/editor/interfaces/SettingInputs/choices/toggle";

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
