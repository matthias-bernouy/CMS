import type { SettingMetadata } from "cms-content/editor/interfaces/SettingInputs/base";

export type ToggleSetting = SettingMetadata<"toggle", boolean> & {
    trueValue?: string;
    falseValue?: string;
};
