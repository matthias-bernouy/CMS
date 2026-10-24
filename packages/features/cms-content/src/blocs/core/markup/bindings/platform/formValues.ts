import {
    CMS_FORM_EMPTY_BEHAVIORS,
    CMS_FORM_VALUE_TYPES,
    type CmsFormEmptyBehavior,
    type CmsFormValueType,
} from "cms-content/blocs/core/markup/bindings/types";

export function isCmsFormValueType(value: string | null): value is CmsFormValueType {
    return (CMS_FORM_VALUE_TYPES as readonly string[]).includes(value ?? "");
}

export function isCmsFormEmptyBehavior(value: string | null): value is CmsFormEmptyBehavior {
    return (CMS_FORM_EMPTY_BEHAVIORS as readonly string[]).includes(value ?? "");
}
