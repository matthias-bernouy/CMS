import type { PageLinkSetting } from "./pageLink";
import type { SchemaPickerSetting } from "./schemaPicker";
import type { SegmentedSetting } from "./segmented";
import type { SelectSetting } from "./select";
import type { TextareaSetting } from "./textarea";
import type { TextSetting } from "./text";
import type { ToggleSetting } from "./toggle";

export type {
    SettingMetadata,
    SettingOption,
    SettingType,
} from "./base";

export type { PageLinkSetting } from "./pageLink";
export type { SchemaPickerMethod, SchemaPickerSetting } from "./schemaPicker";
export type { SegmentedSetting } from "./segmented";
export type { SelectSetting } from "./select";
export type { TextareaSetting } from "./textarea";
export type { TextSetting } from "./text";
export type { ToggleSetting } from "./toggle";

export type Setting =
    | TextSetting
    | TextareaSetting
    | SelectSetting
    | ToggleSetting
    | SegmentedSetting
    | PageLinkSetting
    | SchemaPickerSetting;
