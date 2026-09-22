import type { EndpointPickerMethod } from "cms-content/editor/interfaces/SettingInputs/references/endpointPicker";

export const ENDPOINT_PICKER_METHODS = ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"] as const;

export function isEndpointPickerMethod(value: string): value is EndpointPickerMethod {
    return (ENDPOINT_PICKER_METHODS as readonly string[]).includes(value);
}
