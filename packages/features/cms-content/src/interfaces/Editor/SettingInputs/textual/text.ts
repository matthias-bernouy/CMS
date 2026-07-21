import type { SettingMetadata } from "../base";

export type TextSetting = SettingMetadata<"text", string> & {
    minLength?: number;
    maxLength?: number;
    pattern?: string;
};
