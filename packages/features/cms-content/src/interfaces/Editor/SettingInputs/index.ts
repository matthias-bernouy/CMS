import type { EndpointPickerSetting } from "./references/endpointPicker";
import type { ColorSetting } from "./choices/color";
import type { PageLinkSetting } from "./references/pageLink";
import type { SettingRow } from "./row";
import type { SegmentedSetting } from "./choices/segmented";
import type { SelectSetting } from "./choices/select";
import type { TextareaSetting } from "./textual/textarea";
import type { TextSetting } from "./textual/text";
import type { ToggleSetting } from "./choices/toggle";

export type {
    SettingAttributeChanges,
    SettingAttributeRule,
    SettingAttributeValue,
    SettingDisplay,
    SettingIconName,
    SettingLabelDisplay,
    SettingMetadata,
    SettingOption,
    SettingType,
    SettingVisibilityRule,
    SettingVisibilityValue,
} from "./base";

export type {
    EndpointPickerMethod,
    EndpointPickerSetting,
} from "./references/endpointPicker";
export { ENDPOINT_PICKER_METHODS, isEndpointPickerMethod } from "./references/endpointPicker";
export type { ColorSetting } from "./choices/color";
export type { PageLinkSetting } from "./references/pageLink";
export type { SettingRow } from "./row";
export type { SegmentedSetting } from "./choices/segmented";
export type { SelectSetting } from "./choices/select";
export type { TextareaSetting } from "./textual/textarea";
export type { TextSetting } from "./textual/text";
export type { ToggleSetting } from "./choices/toggle";

export type SettingControl =
    | TextSetting
    | TextareaSetting
    | SelectSetting
    | ToggleSetting
    | SegmentedSetting
    | PageLinkSetting
    | EndpointPickerSetting
    | ColorSetting;

export type Setting = SettingControl | SettingRow;
