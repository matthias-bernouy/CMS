export type SettingType =
    | "text"
    | "textarea"
    | "select"
    | "toggle"
    | "segmented"
    | "page-link"
    | "endpoint-picker"
    | "color";

export type SettingDisplay = "label" | "icon" | "icon-label";

export type SettingLabelDisplay = "visible" | "hidden" | "sr-only";

export type SettingIconName =
    | "layout-none"
    | "layout-column"
    | "layout-row"
    | "layout-grid"
    | "align-start"
    | "align-center"
    | "align-end"
    | "align-stretch"
    | "justify-start"
    | "justify-center"
    | "justify-end"
    | "justify-between"
    | "side-top"
    | "side-right"
    | "side-bottom"
    | "side-left"
    | "axis-x"
    | "axis-y"
    | "radius"
    | "color"
    | "visibility"
    | "remove"
    | "add"
    | "more";

export type SettingOption = {
    label: string;
    value: string;
    icon?: SettingIconName;
    ariaLabel?: string;
    display?: SettingDisplay;
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
    icon?: SettingIconName;
    ariaLabel?: string;
    display?: SettingDisplay;
    labelDisplay?: SettingLabelDisplay;
    sublabel?: string;
    help?: string;
    placeholder?: string;
    defaultValue?: TValue;
    disabled?: boolean;
    required?: boolean;
    visibleWhen?: SettingVisibilityRule | SettingVisibilityRule[];
    attributesOnValue?: SettingAttributeRule[];
};
