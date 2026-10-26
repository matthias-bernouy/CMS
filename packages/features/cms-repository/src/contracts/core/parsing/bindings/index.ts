import { ReleaseValidationError } from "../../protocol/errors";
import { expectArray, expectRecord, expectString, optionalString, rejectUnknownKeys } from "../../protocol/values";
import type { ReleaseLimits } from "../../protocol/limits";
import type { CapabilityBinding } from "../../../interfaces/CapabilityBinding";
import { parseHttpBinding } from "./http";

export function parseCapabilityBindings(
    record: Record<string, unknown>,
    path: string,
    limits: Readonly<ReleaseLimits>,
) {
    const source = expectArray(record.bindings, `${path}.bindings`, "invalid_binding");
    if (!source.length || source.length > 16) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "bindings must contain between 1 and 16 entries",
            `${path}.bindings`,
        );
    }
    const bindings = source.map((item, index): CapabilityBinding => {
        const location = `${path}.bindings[${index}]`;
        const value = expectRecord(item, location, "invalid_binding");
        const id = expectString(value.id, `${location}.id`, "invalid_binding", 64);
        if (!/^[a-z][a-z0-9]*(?:[.-][a-z0-9]+)*$/u.test(id)) {
            throw new ReleaseValidationError("invalid_binding", "invalid binding ID", `${location}.id`);
        }
        if (value.transport === "http") {
            const { id: _, ...definition } = value;
            return { id, ...parseHttpBinding(definition, location, limits) };
        }
        rejectUnknownKeys(value, ["id", "transport", "tool"], location, "invalid_binding");
        if (value.transport !== "mcp") {
            throw new ReleaseValidationError(
                "invalid_binding",
                "unsupported binding transport",
                `${location}.transport`,
            );
        }
        if (value.tool === undefined) {
            return { id, transport: "mcp" };
        }
        const tool = expectRecord(value.tool, `${location}.tool`, "invalid_binding");
        rejectUnknownKeys(tool, ["name", "title", "description"], `${location}.tool`, "invalid_binding");
        const name = optionalString(tool.name, `${location}.tool.name`, "invalid_binding", 128);
        if (name && !/^[A-Za-z0-9_.-]+$/u.test(name)) {
            throw new ReleaseValidationError("invalid_binding", "invalid MCP tool name", `${location}.tool.name`);
        }
        const title = optionalString(tool.title, `${location}.tool.title`, "invalid_binding", 128);
        const description = optionalString(tool.description, `${location}.tool.description`, "invalid_binding", 4096);
        return {
            id,
            transport: "mcp",
            tool: { ...(name ? { name } : {}), ...(title ? { title } : {}), ...(description ? { description } : {}) },
        };
    });
    if (new Set(bindings.map(({ id }) => id)).size !== bindings.length) {
        throw new ReleaseValidationError("invalid_binding", "duplicate binding IDs", `${path}.bindings`);
    }
    if (record.responseEffects !== undefined && bindings.some(({ transport }) => transport === "mcp")) {
        throw new ReleaseValidationError(
            "invalid_binding",
            "MCP cannot apply browser response effects",
            `${path}.bindings`,
        );
    }
    return { bindings };
}
