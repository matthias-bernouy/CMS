import {
    CMS_FORM_VALUE_TYPES,
    CMS_FORM_EMPTY_BEHAVIORS,
    type CmsFormValueType,
    type CmsFormEmptyBehavior,
} from "cms-content/blocs/core/markup/bindings/types";

export function isCmsFormValueType(value: string | null): value is CmsFormValueType {
    return (CMS_FORM_VALUE_TYPES as readonly string[]).includes(value ?? "");
}

export function isCmsFormEmptyBehavior(value: string | null): value is CmsFormEmptyBehavior {
    return (CMS_FORM_EMPTY_BEHAVIORS as readonly string[]).includes(value ?? "");
}

export function isMutationInvalidations(value: string | null): boolean {
    return parseMutationInvalidations(value) !== null;
}

export function parseMutationInvalidations(value: string | null): readonly string[] | null {
    const names = value?.trim().split(/\s+/u).filter(Boolean) ?? [];
    if (
        names.length === 0 ||
        names.length > 8 ||
        new Set(names).size !== names.length ||
        names.some((name) => !/^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    ) {
        return null;
    }
    return names;
}
