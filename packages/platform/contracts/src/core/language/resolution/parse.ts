import type { UlviaResolvedSchema, UlviaSchemaReference } from "ulvia-contracts/interfaces/UlviaSchema";
import { expectRecord, expectString, rejectUnknownKeys, optionalString } from "ulvia-contracts/core/protocol/values";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { parseIdentifier } from "ulvia-contracts/core/parsing/identifiers";
import { PROPERTY_NAME_PATTERN } from "ulvia-contracts/core/language/schema/context";
function parseSchemaReference(value: unknown, path: string): UlviaSchemaReference {
    const record = expectRecord(value, path, "invalid_schema");
    rejectUnknownKeys(record, ["source", "path"], path, "invalid_schema");
    const pointer = expectString(record.path, `${path}.path`, "invalid_schema", 2048);
    if (
        (record.source !== "value" && record.source !== "input") ||
        !pointer.startsWith("/") ||
        /~(?![01])/u.test(pointer)
    ) {
        throw new ReleaseValidationError("invalid_schema", "references need a source and canonical JSON pointer", path);
    }
    return { source: record.source, path: pointer };
}
export function parseResolvedSchema(record: Record<string, unknown>, path: string): UlviaResolvedSchema {
    rejectUnknownKeys(
        record,
        ["type", "resolver", "selector", "version", "choices", "nullable", "description"],
        path,
        "invalid_schema",
    );
    if (record.nullable !== undefined && record.nullable !== true) {
        throw new ReleaseValidationError("invalid_schema", "nullable must be true when present", path);
    }
    const selector = expectRecord(record.selector, `${path}.selector`, "invalid_schema");
    const entries = Object.entries(selector);
    if (!entries.length || entries.length > 32 || entries.some(([key]) => !PROPERTY_NAME_PATTERN.test(key))) {
        throw new ReleaseValidationError("invalid_schema", "resolved selectors need 1 to 32 named references", path);
    }
    const description = optionalString(record.description, `${path}.description`, "invalid_schema", 4096);
    return {
        type: "resolved",
        resolver: parseIdentifier(record.resolver, `${path}.resolver`),
        selector: Object.fromEntries(
            entries.map(([key, value]) => [key, parseSchemaReference(value, `${path}.selector.${key}`)]),
        ),
        ...(record.version === undefined ? {} : { version: parseSchemaReference(record.version, `${path}.version`) }),
        ...(record.choices === undefined ? {} : { choices: parseIdentifier(record.choices, `${path}.choices`) }),
        ...(record.nullable === true ? { nullable: true } : {}),
        ...(description === undefined ? {} : { description }),
    };
}
