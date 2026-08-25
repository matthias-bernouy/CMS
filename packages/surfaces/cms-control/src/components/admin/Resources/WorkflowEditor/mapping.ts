import type { MappingShape, MappingTarget, ReferenceOption, ValueDraft } from "./mappingTypes";

export type { MappingShape, MappingTarget, ReferenceOption, ValueDraft } from "./mappingTypes";
export { mappedObject, resolvedDraftValue } from "./mappingValues";

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
    select.setAttribute("aria-label", label);
    select.append(option("", label));
    for (const reference of references) {
        select.append(option(reference.value, reference.label));
    }
    select.append(option("__literal__", "Fixed value…"));
    select.value = draft.mode === "literal" ? "__literal__" : draft.value;

    const literal = document.createElement("input");
    literal.type = "text";
    literal.setAttribute("aria-label", `${label}: fixed value`);
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
    row.append(identity, valuePicker(draft, compatibleReferences(references, target.shape), `${target.label} source`));
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

function option(value: string, label: string): HTMLOptionElement {
    const el = document.createElement("option");
    el.value = value;
    el.textContent = label;
    return el;
}
