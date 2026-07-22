import type { SettingMetadata } from "../base";

export type ToggleSetting = SettingMetadata<"toggle", boolean> & {
    trueValue?: string;
    falseValue?: string;
};
