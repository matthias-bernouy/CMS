import type { SettingMetadata } from "../base";

export const ENDPOINT_PICKER_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export type EndpointPickerMethod = (typeof ENDPOINT_PICKER_METHODS)[number];

export type EndpointPickerSetting = SettingMetadata<"endpoint-picker", string> & {
    methods?: EndpointPickerMethod[];
    methodAttribute?: string;
    defaultMethod?: EndpointPickerMethod;
    defaultBody?: string;
};

export function isEndpointPickerMethod(value: string): value is EndpointPickerMethod {
    return (ENDPOINT_PICKER_METHODS as readonly string[]).includes(value);
}
