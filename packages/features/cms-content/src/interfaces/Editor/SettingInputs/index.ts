import type { EndpointPickerSetting } from "./endpointPicker";
import type { ColorSetting } from "./color";
import type { PageLinkSetting } from "./pageLink";
import type { SettingRow } from "./row";
import type { SegmentedSetting } from "./segmented";
import type { SelectSetting } from "./select";
import type { TextareaSetting } from "./textarea";
import type { TextSetting } from "./text";
import type { ToggleSetting } from "./toggle";

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
} from "./endpointPicker";
export { ENDPOINT_PICKER_METHODS, isEndpointPickerMethod } from "./endpointPicker";
export type { ColorSetting } from "./color";
export type { PageLinkSetting } from "./pageLink";
export type { SettingRow } from "./row";
export type { SegmentedSetting } from "./segmented";
export type { SelectSetting } from "./select";
export type { TextareaSetting } from "./textarea";
export type { TextSetting } from "./text";
export type { ToggleSetting } from "./toggle";

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
