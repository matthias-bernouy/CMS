import type { SettingMetadata } from "cms-content/editor/interfaces/SettingInputs/base";

export type TextSetting = SettingMetadata<"text", string> & {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
};
