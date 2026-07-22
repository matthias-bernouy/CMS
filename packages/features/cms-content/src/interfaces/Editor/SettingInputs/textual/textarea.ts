import type { SettingMetadata } from "../base";

export type TextareaSetting = SettingMetadata<"textarea", string> & {
    rows?: number;
    minLength?: number;
    maxLength?: number;
};
