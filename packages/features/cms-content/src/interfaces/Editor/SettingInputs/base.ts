export type SettingType =
    | "text"
    | "textarea"
    | "select"
    | "toggle"
    | "segmented"
    | "page-link"
    | "endpoint-picker";

export type SettingOption = {
    label: string;
    value: string;
};

export type SettingVisibilityValue = string | boolean;

export type SettingVisibilityRule = {
    attribute: string;
    equals?: SettingVisibilityValue | SettingVisibilityValue[];
    notEquals?: SettingVisibilityValue | SettingVisibilityValue[];
};

export type SettingAttributeValue = string | boolean | null;

export type SettingAttributeChanges = Record<string, SettingAttributeValue>;

export type SettingAttributeRule = {
    value: SettingVisibilityValue | SettingVisibilityValue[];
    attributes: SettingAttributeChanges;
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
    visibleWhen?: SettingVisibilityRule | SettingVisibilityRule[];
    attributesOnValue?: SettingAttributeRule[];
};
