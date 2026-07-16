import type { MappingShape } from "./mapping";

export type SchemaFieldDraft = {
    name: string;
    type: MappingShape["type"];
    required: boolean;
};

export function schemaFieldsEditor(fields: SchemaFieldDraft[], onChange: () => void, showRequired = true): HTMLElement {
    const root = document.createElement("div");
    root.className = "schema-fields";
    if (!fields.length) {
        const empty = document.createElement("div");
        empty.className = "mapping-empty";
        empty.textContent = "No fields defined.";
        root.append(empty);
    }
    fields.forEach((field, index) => root.append(schemaFieldRow(field, index, fields, onChange, showRequired)));

    const add = document.createElement("button");
    add.type = "button";
    add.className = "button secondary small";
    add.textContent = "+ Add field";
    add.addEventListener("click", () => {
        fields.push({ name: `field${fields.length + 1}`, type: "string", required: false });
        onChange();
    });
    root.append(add);
    return root;
}

export function paramsFromFields(fields: SchemaFieldDraft[]): Record<string, MappingShape> {
    return Object.fromEntries(fields.filter(field => field.name.trim()).map(field => [field.name.trim(), { type: field.type }]));
}

export function objectShapeFromFields(fields: SchemaFieldDraft[]): MappingShape | undefined {
    const properties = paramsFromFields(fields);
    if (!Object.keys(properties).length) return undefined;
    const required = fields.filter(field => field.required && field.name.trim()).map(field => field.name.trim());
    return {
        type: "object",
        properties,
        ...(required.length ? { required } : {}),
    };
}

function schemaFieldRow(
    field: SchemaFieldDraft,
    index: number,
    fields: SchemaFieldDraft[],
    onChange: () => void,
    showRequired: boolean,
): HTMLElement {
    const row = document.createElement("div");
    row.className = "schema-field-row";

    const name = document.createElement("input");
    name.value = field.name;
    name.placeholder = "fieldName";
    name.setAttribute("aria-label", "Field name");
    name.addEventListener("input", () => field.name = name.value);
    name.addEventListener("change", onChange);

    const type = document.createElement("select");
    for (const value of ["string", "number", "boolean", "object", "array"] as const) {
        const option = document.createElement("option");
        option.value = value;
        option.textContent = value;
        type.append(option);
    }
    type.value = field.type;
    type.setAttribute("aria-label", "Field type");
    type.addEventListener("change", () => {
        field.type = type.value as SchemaFieldDraft["type"];
        onChange();
    });

    const requiredLabel = document.createElement("label");
    requiredLabel.className = "check compact-check";
    const required = document.createElement("input");
    required.type = "checkbox";
    required.checked = field.required;
    required.addEventListener("change", () => {
        field.required = required.checked;
        onChange();
    });
    requiredLabel.append(required, document.createTextNode("Required"));
    requiredLabel.hidden = !showRequired;

    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "icon-button";
    remove.textContent = "×";
    remove.setAttribute("aria-label", `Remove ${field.name || `field ${index + 1}`}`);
    remove.addEventListener("click", () => {
        fields.splice(index, 1);
        onChange();
    });
    row.append(name, type, requiredLabel, remove);
    return row;
}
