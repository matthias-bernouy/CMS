import type { SettingMetadata } from "./base";

export type SchemaPickerMethod =
    | "get"
    | "post"
    | "put"
    | "patch"
    | "delete";

export type SchemaPickerSetting = SettingMetadata<"schema-picker", string> & {
    methods?: SchemaPickerMethod[];
};
