const NATIVE_BOOLEAN_ATTRIBUTES = new Set([
    "checked",
    "default",
    "disabled",
    "hidden",
    "inert",
    "multiple",
    "readonly",
    "required",
    "selected",
]);

type NativeAttributeBindingKind = "boolean" | "string";

export function nativeAttributeBindingKind(attribute: string): NativeAttributeBindingKind {
    return NATIVE_BOOLEAN_ATTRIBUTES.has(attribute.toLowerCase()) ? "boolean" : "string";
}
