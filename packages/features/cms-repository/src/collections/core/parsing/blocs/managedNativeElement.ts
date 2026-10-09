import type {
    CollectionManagedNativeAttributeConstraint,
    CollectionManagedNativeElement,
    CollectionManagedNativeElementTag,
} from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import { array, keys, record, unique } from "../../values";

export const COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS = [
    "h1",
    "h2",
    "h3",
    "h4",
    "h5",
    "h6",
    "p",
    "a",
    "button",
    "input",
    "textarea",
    "select",
    "output",
    "img",
    "svg",
    "span",
] as const satisfies readonly CollectionManagedNativeElementTag[];

const tags = new Set<string>(COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS);
const NATIVE_ATTRIBUTES: Readonly<Record<string, ReadonlySet<string>>> = {
    a: new Set(["href", "target", "rel", "aria-current"]),
    button: new Set(["type", "disabled", "name", "value"]),
    img: new Set(["src", "alt", "role", "aria-hidden", "loading", "fetchpriority", "width", "height", "decoding"]),
    input: new Set([
        "type",
        "name",
        "value",
        "checked",
        "disabled",
        "required",
        "readonly",
        "autocomplete",
        "placeholder",
        "min",
        "max",
        "step",
        "multiple",
        "accept",
        "inputmode",
        "role",
    ]),
    output: new Set(["name", "for", "aria-live"]),
    select: new Set(["name", "multiple", "size", "required", "disabled"]),
    svg: new Set(["role", "aria-hidden", "aria-label"]),
    textarea: new Set(["name", "rows", "required", "readonly", "disabled", "autocomplete", "placeholder", "maxlength"]),
};

function parseTag(value: unknown, path: string): CollectionManagedNativeElementTag {
    if (typeof value !== "string" || !tags.has(value)) {
        invalid(`must be one of ${COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS.join(", ")}`, path);
    }
    return value as CollectionManagedNativeElementTag;
}

export function parseManagedNativeElement(value: unknown, path: string): CollectionManagedNativeElement {
    const source = record(value, path);
    keys(source, ["accepts", "attributes"], path);
    const accepts = array(source.accepts, COLLECTION_MANAGED_NATIVE_ELEMENT_TAGS.length, `${path}.accepts`).map(
        (tag, index) => parseTag(tag, `${path}.accepts[${index}]`),
    );
    if (accepts.length === 0) {
        invalid("must accept at least one native element tag", `${path}.accepts`);
    }
    unique(accepts, `${path}.accepts`);
    const attributes =
        source.attributes === undefined
            ? undefined
            : parseAttributeConstraints(source.attributes, `${path}.attributes`);
    return { accepts, ...(attributes ? { attributes } : {}) };
}

function parseAttributeConstraints(
    value: unknown,
    path: string,
): Readonly<Record<string, CollectionManagedNativeAttributeConstraint>> {
    const source = record(value, path);
    const entries = Object.entries(source);
    if (entries.length === 0 || entries.length > 16) {
        invalid("must contain between 1 and 16 attribute constraints", path);
    }
    return Object.fromEntries(
        entries.map(([name, value]) => {
            const attributePath = `${path}.${name}`;
            if (!/^[a-z][a-z0-9-]*$/u.test(name)) {
                invalid("attribute name must be safe and lowercase", attributePath);
            }
            const constraint = record(value, attributePath);
            keys(constraint, ["required", "values"], attributePath);
            if (constraint.required !== undefined && typeof constraint.required !== "boolean") {
                invalid("required must be a boolean", `${attributePath}.required`);
            }
            const values =
                constraint.values === undefined
                    ? undefined
                    : array(constraint.values, 32, `${attributePath}.values`).map((entry, index) => {
                          if (typeof entry !== "string" || entry.length > 128 || /[\u0000-\u001f\u007f]/u.test(entry)) {
                              invalid(
                                  "must be a string of at most 128 characters without controls",
                                  `${attributePath}.values[${index}]`,
                              );
                          }
                          return entry;
                      });
            if (values?.length === 0) {
                invalid("must contain at least one accepted value", `${attributePath}.values`);
            }
            if (values) {
                unique(values, `${attributePath}.values`);
            }
            if (constraint.required === undefined && values === undefined) {
                invalid("must declare required, values, or both", attributePath);
            }
            return [
                name,
                {
                    ...(constraint.required === undefined ? {} : { required: constraint.required }),
                    ...(values === undefined ? {} : { values }),
                },
            ];
        }),
    );
}

export function managedNativeAttributesIssue(
    contract: CollectionManagedNativeElement,
    attributes: Readonly<Record<string, string>>,
    tag?: string,
    options: { allowUnknown?: boolean } = {},
): string | null {
    if (tag && !options.allowUnknown) {
        const allowed = NATIVE_ATTRIBUTES[tag] ?? new Set<string>();
        for (const name of Object.keys(attributes)) {
            if (!allowed.has(name) && !Object.hasOwn(contract.attributes ?? {}, name)) {
                return `native attribute ${JSON.stringify(name)} is not allowed on <${tag}>`;
            }
        }
    }
    for (const [name, constraint] of Object.entries(contract.attributes ?? {})) {
        const value = attributes[name];
        if (value === undefined) {
            if (constraint.required) {
                return `requires native attribute ${JSON.stringify(name)}`;
            }
            continue;
        }
        if (constraint.values && !constraint.values.includes(value)) {
            return `native attribute ${JSON.stringify(name)} must be one of ${constraint.values
                .map((entry) => JSON.stringify(entry))
                .join(", ")}`;
        }
    }
    return null;
}
