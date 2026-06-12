export type SettingType =
    | "text"
    | "textarea"
    | "select"
    | "toggle"
    | "segmented"
    | "page-link"
    | "schema-picker";

export type SettingOption = {
    label: string;
    value: string;
};

export type SettingMetadata<TType extends SettingType, TValue> = {
    type: TType;
    label: string;
    attribute: string;
    sublabel?: string;
    help?: string;
    placeholder?: string;
    defaultValue?: TValue;
    disabled?: boolean;
    required?: boolean;
};
