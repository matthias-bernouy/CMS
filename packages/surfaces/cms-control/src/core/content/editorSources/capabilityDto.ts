import type { DataField, DataFieldType } from "@bernouy/cms-content/editor";
import type { EditorDataSource } from "@bernouy/cms-editor-system-v2";
import type { GatewayEditorCapability } from "@bernouy/cms-gateway";
import type { UlviaSchema } from "@bernouy/cms-repository/contracts/schema";

type BodyField = NonNullable<EditorDataSource["body"]>["fields"][number];

/** The picker describes the selected contract, independent of its installed provider. */
export function editorCapabilityDto(basePath: string, capability: GatewayEditorCapability): EditorDataSource {
    return {
        label: capability.description ?? capability.capabilityId,
        url: `${basePath}/.cms/call/${encodeURIComponent(capability.contractId)}/${encodeURIComponent(capability.capabilityId)}`,
        method: "POST",
        provider: capability.contractId,
        providerLabel: capability.contractLabel,
        ...(capability.description ? { description: capability.description } : {}),
        body: {
            contentType: "application/json",
            fields: inputFields(capability.input),
        },
        fields: outputFields(capability.output),
    };
}

function inputFields(schema: GatewayEditorCapability["input"]): BodyField[] {
    const required = new Set(schema.required);
    return Object.entries(schema.properties).map(([path, child]) => {
        const children = nestedInputFields(child);
        return {
            path,
            type: fieldType(child),
            ...(required.has(path) ? { required: true } : {}),
            ...(children.length ? { children } : {}),
        };
    });
}

function nestedInputFields(schema: UlviaSchema): BodyField[] {
    if (schema.type === "object") {
        return inputFields(schema);
    }
    if (schema.type === "array") {
        return nestedInputFields(schema.items);
    }
    return [];
}

function outputFields(schema: UlviaSchema): DataField[] {
    if (schema.type === "object") {
        return Object.entries(schema.properties).map(([path, child]) => ({
            path,
            type: fieldType(child),
            children: outputFields(child),
        }));
    }
    if (schema.type === "array") {
        return outputFields(schema.items);
    }
    return [];
}

function fieldType(schema: UlviaSchema): DataFieldType {
    switch (schema.type) {
        case "integer":
        case "number":
            return "number";
        case "string":
            return schema.format === "date" || schema.format === "date-time" ? "date" : "string";
        case "boolean":
            return "boolean";
        case "object":
        case "map":
            return "object";
        case "array":
            return "array";
        default:
            return "unknown";
    }
}
