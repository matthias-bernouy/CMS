import type { FunctionValue } from "@bernouy/cms-functions";

export type MappingShape = {
    type: "string" | "number" | "boolean" | "object" | "array";
    properties?: Record<string, MappingShape>;
    items?: MappingShape;
    required?: string[];
    semantic?: {
        kind: "user-id";
        authority?: string;
    };
};

export type ReferenceOption = {
    value: string;
    label: string;
    shape?: MappingShape;
};

export type MappingTarget = {
    path: string;
    label: string;
    required?: boolean;
    shape?: MappingShape;
};

export type ValueDraft = {
    mode: "reference" | "literal";
    value: string;
};

export function referencesFromShape(shape: MappingShape | undefined, prefix: string, label: string): ReferenceOption[] {
    if (!shape) {
        return [];
    }
    const options: ReferenceOption[] = [{ value: prefix, label, shape }];
    if (shape.type !== "object") {
        return options;
    }
    for (const [name, child] of Object.entries(shape.properties ?? {})) {
        options.push(...referencesFromShape(child, `${prefix}.${name}`, `${label} / ${name}`));
    }
    return options;
}

export function targetsFromShape(shape: MappingShape | undefined, prefix = ""): MappingTarget[] {
    if (!shape) {
        return [];
    }
    if (shape.type !== "object" || !Object.keys(shape.properties ?? {}).length) {
        return [{ path: prefix, label: prefix || "Value", shape }];
    }
    return Object.entries(shape.properties ?? {}).flatMap(([name, child]) => {
        const path = prefix ? `${prefix}.${name}` : name;
        if (child.type === "object" && Object.keys(child.properties ?? {}).length) {
            return targetsFromShape(child, path);
        }
        return [
            {
                path,
                label: path,
                required: shape.required?.includes(name),
                shape: child,
            },
        ];
    });
}

export function mappingEditor(
    targets: MappingTarget[],
    references: ReferenceOption[],
    draft: Record<string, ValueDraft>,
    emptyMessage: string,
): HTMLElement {
    const root = document.createElement("div");
    root.className = "mapping-editor";
    if (!targets.length) {
        const empty = document.createElement("div");
        empty.className = "mapping-empty";
        empty.textContent = emptyMessage;
        root.append(empty);
        return root;
    }

    for (const target of targets) {
        draft[target.path] ??= { mode: "reference", value: "" };
        root.append(mappingRow(target, references, draft[target.path]!));
    }
    return root;
}

export function valuePicker(draft: ValueDraft, references: ReferenceOption[], label = "Choose a value"): HTMLElement {
    const wrap = document.createElement("div");
    wrap.className = "value-picker";
    const select = document.createElement("select");
    select.append(option("", label));
    for (const reference of references) {
        select.append(option(reference.value, reference.label));
    }
    select.append(option("__literal__", "Fixed value…"));
    select.value = draft.mode === "literal" ? "__literal__" : draft.value;

    const literal = document.createElement("input");
    literal.type = "text";
    literal.placeholder = "Text, number, boolean, or JSON";
    literal.value = draft.mode === "literal" ? draft.value : "";
    literal.hidden = draft.mode !== "literal";

    select.addEventListener("change", () => {
        if (select.value === "__literal__") {
            draft.mode = "literal";
            draft.value = literal.value;
            literal.hidden = false;
            literal.focus();
            return;
        }
        draft.mode = "reference";
        draft.value = select.value;
        literal.hidden = true;
    });
    literal.addEventListener("input", () => (draft.value = literal.value));
    wrap.append(select, literal);
    return wrap;
}

export function mappedObject(draft: Record<string, ValueDraft>): Record<string, FunctionValue> {
    const result: Record<string, FunctionValue> = {};
    for (const [path, value] of Object.entries(draft)) {
        if (!value.value) {
            continue;
        }
        setPath(result, path, resolvedDraftValue(value));
    }
    return result;
}

export function resolvedDraftValue(draft: ValueDraft): FunctionValue {
    if (draft.mode === "reference") {
        return draft.value;
    }
    const raw = draft.value.trim();
    if (!raw) {
        return "";
    }
    try {
        return JSON.parse(raw) as FunctionValue;
    } catch {
        return raw;
    }
}

function mappingRow(target: MappingTarget, references: ReferenceOption[], draft: ValueDraft): HTMLElement {
    const row = document.createElement("div");
    row.className = "mapping-row";
    const identity = document.createElement("div");
    identity.className = "mapping-target";
    const name = document.createElement("strong");
    name.textContent = target.label;
    const meta = document.createElement("span");
    const semantic = target.shape?.semantic?.kind === "user-id" ? " · user identity" : "";
    meta.textContent = `${target.shape?.type ?? "value"}${semantic}${target.required ? " · required" : ""}`;
    identity.append(name, meta);
    row.append(identity, valuePicker(draft, compatibleReferences(references, target.shape)));
    return row;
}

function compatibleReferences(references: ReferenceOption[], shape: MappingShape | undefined): ReferenceOption[] {
    if (!shape) {
        return references;
    }
    return references.filter((reference) => {
        if (!reference.shape) {
            return true;
        }
        if (shape.semantic?.kind === "user-id") {
            return reference.shape.semantic?.kind === "user-id";
        }
        return reference.shape.type === shape.type && reference.shape.semantic?.kind !== "user-id";
    });
}

function setPath(target: Record<string, FunctionValue>, path: string, value: FunctionValue): void {
    if (!path) {
        target.value = value;
        return;
    }
    const parts = path.split(".").filter(Boolean);
    let current = target;
    for (const [index, part] of parts.entries()) {
        if (index === parts.length - 1) {
            current[part] = value;
            return;
        }
        const existing = current[part];
        if (!existing || typeof existing !== "object" || Array.isArray(existing)) {
            current[part] = {};
        }
        current = current[part] as Record<string, FunctionValue>;
    }
}

function option(value: string, label: string): HTMLOptionElement {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
}
