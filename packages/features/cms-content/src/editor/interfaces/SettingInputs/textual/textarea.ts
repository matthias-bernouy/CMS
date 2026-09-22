import type { SettingMetadata } from "cms-content/editor/interfaces/SettingInputs/base";

export type TextareaSetting = SettingMetadata<"textarea", string> & {
    rows?: number;
    minLength?: number;
    maxLength?: number;
};
