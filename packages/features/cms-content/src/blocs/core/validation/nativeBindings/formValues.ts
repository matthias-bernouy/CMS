import {
    CMS_SOURCE_SERIALIZATIONS,
    CMS_FORM_VALUE_TYPES,
    CMS_FORM_EMPTY_BEHAVIORS,
    type CmsSourceSerialization,
    type CmsFormValueType,
    type CmsFormEmptyBehavior,
} from "cms-content/blocs/core/markup/bindings/types";

export function isCmsSourceSerialization(value: string | null): value is CmsSourceSerialization {
    return (CMS_SOURCE_SERIALIZATIONS as readonly string[]).includes(value ?? "");
}

export function isCmsFormValueType(value: string | null): value is CmsFormValueType {
    return (CMS_FORM_VALUE_TYPES as readonly string[]).includes(value ?? "");
}

export function isCmsFormEmptyBehavior(value: string | null): value is CmsFormEmptyBehavior {
    return (CMS_FORM_EMPTY_BEHAVIORS as readonly string[]).includes(value ?? "");
}

export function isCmsSourceSuccessReload(value: string | null): boolean {
    return /^#[A-Za-z_][\w:.-]*$/.test(value ?? "");
}
