import type { SettingMetadata } from "cms-content/editor/interfaces/SettingInputs/base";

export type EndpointPickerMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE" | "HEAD" | "OPTIONS";

export type EndpointPickerSetting = SettingMetadata<"endpoint-picker", string> & {
    methods?: EndpointPickerMethod[];
    methodAttribute?: string;
    defaultMethod?: EndpointPickerMethod;
    defaultBody?: string;
};
