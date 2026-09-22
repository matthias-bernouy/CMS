import type { EndpointPickerSetting } from "cms-content/editor/interfaces/SettingInputs/references/endpointPicker";
import type { ColorSetting } from "cms-content/editor/interfaces/SettingInputs/choices/color";
import type { PageLinkSetting } from "cms-content/editor/interfaces/SettingInputs/references/pageLink";
import type { SettingRow } from "cms-content/editor/interfaces/SettingInputs/row";
import type { SegmentedSetting } from "cms-content/editor/interfaces/SettingInputs/choices/segmented";
import type { SelectSetting } from "cms-content/editor/interfaces/SettingInputs/choices/select";
import type { TextareaSetting } from "cms-content/editor/interfaces/SettingInputs/textual/textarea";
import type { TextSetting } from "cms-content/editor/interfaces/SettingInputs/textual/text";
import type { ToggleSetting } from "cms-content/editor/interfaces/SettingInputs/choices/toggle";

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
} from "cms-content/editor/interfaces/SettingInputs/base";

export type {
    EndpointPickerMethod,
    EndpointPickerSetting,
} from "cms-content/editor/interfaces/SettingInputs/references/endpointPicker";
export type { ColorSetting } from "cms-content/editor/interfaces/SettingInputs/choices/color";
export type { PageLinkSetting } from "cms-content/editor/interfaces/SettingInputs/references/pageLink";
export type { SettingRow } from "cms-content/editor/interfaces/SettingInputs/row";
export type { SegmentedSetting } from "cms-content/editor/interfaces/SettingInputs/choices/segmented";
export type { SelectSetting } from "cms-content/editor/interfaces/SettingInputs/choices/select";
export type { TextareaSetting } from "cms-content/editor/interfaces/SettingInputs/textual/textarea";
export type { TextSetting } from "cms-content/editor/interfaces/SettingInputs/textual/text";
export type { ToggleSetting } from "cms-content/editor/interfaces/SettingInputs/choices/toggle";

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
