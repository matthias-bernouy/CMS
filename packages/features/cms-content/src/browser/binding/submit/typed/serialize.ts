import type { SerializedFormData, SerializedFormValue } from "../types";
import { controlValue, typedControls } from "./controls";
import { setTypedPath } from "./paths";

/** Values come from the form's associated controls, never from a widget payload. */
export function serializeTypedForm(form: HTMLFormElement): SerializedFormData {
    const data: SerializedFormData = {};
    const assigned = new Set<string>();
    let native: FormData | undefined;
    const repeatedCustomNames = new Set<string>();
    for (const control of typedControls(form)) {
        const name = control.getAttribute("name")!;
        const raw = controlValue(control);
        const customArray = name.endsWith("[]") && control.localName.includes("-") && typeof raw === "string";
        if (customArray && repeatedCustomNames.has(name)) {
            continue;
        }
        if (customArray) {
            repeatedCustomNames.add(name);
            native ??= new form.ownerDocument.defaultView!.FormData(form);
        }
        const value = customArray ? native!.getAll(name) : raw;
        if (value !== undefined) {
            setTypedPath(data, control.getAttribute("name")!, cloneJson(value, new Set()), assigned);
        }
    }
    return cloneJson(data, new Set()) as SerializedFormData;
}

function cloneJson(value: unknown, ancestors: Set<object>): SerializedFormValue {
    if (value === null || typeof value === "string" || typeof value === "boolean") {
        return value;
    }
    if (typeof value === "number" && Number.isFinite(value)) {
        return value;
    }
    if (!value || typeof value !== "object" || ancestors.has(value)) {
        throw new Error("Typed form controls must return finite, acyclic JSON values.");
    }
    ancestors.add(value);
    try {
        if (Array.isArray(value)) {
            if (Object.keys(value).length !== value.length) {
                throw new Error("Typed form array indices must be contiguous.");
            }
            return value.map((item) => cloneJson(item, ancestors));
        }
        const prototype = Object.getPrototypeOf(value);
        if (prototype !== Object.prototype && prototype !== null) {
            throw new Error("Typed form controls must return JSON objects; binary files require multipart forms.");
        }
        return Object.fromEntries(
            Object.entries(value)
                .filter(([, item]) => item !== undefined)
                .map(([key, item]) => {
                    if (["__proto__", "constructor", "prototype"].includes(key)) {
                        throw new Error(`Invalid typed form object key: ${key}.`);
                    }
                    return [key, cloneJson(item, ancestors)];
                }),
        );
    } finally {
        ancestors.delete(value);
    }
}
