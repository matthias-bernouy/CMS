import type { ContractEventDefinition } from "ulvia-contracts/interfaces/ContractEvent";
import type { SchemaParseState } from "ulvia-contracts/core/language/schema/context";
import { parseSchemaAt } from "ulvia-contracts/core/language/schema/parseSchema";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import {
    expectArray,
    expectBoolean,
    expectRecord,
    expectString,
    optionalString,
    rejectUnknownKeys,
} from "ulvia-contracts/core/protocol/values";
import { parseIdentifier } from "ulvia-contracts/core/parsing/identifiers";
import {
    parseCapabilityDeprecation,
    validateDeprecationReferences,
} from "ulvia-contracts/core/parsing/parseDeprecation";
import { parseFilterKeys } from "./filters";
import { isJsonEventSchema } from "./schema";

export function parseContractEvents(
    value: unknown,
    state: SchemaParseState,
    unresolvedParent: boolean,
): readonly ContractEventDefinition[] | undefined {
    if (value === undefined) {
        return undefined;
    }
    const source = expectArray(value, "$.events", "invalid_contract");
    if (!source.length || source.length > state.limits.maxCapabilities) {
        throw new ReleaseValidationError("invalid_contract", "events must be a nonempty bounded list", "$.events");
    }
    const events = source.map((entry, index): ContractEventDefinition => {
        const path = `$.events[${index}]`;
        const record = expectRecord(entry, path, "invalid_contract");
        rejectUnknownKeys(
            record,
            ["id", "description", "schema", "sensitive", "docs", "deprecation", "filterKeys"],
            path,
            "invalid_contract",
        );
        const schema = parseSchemaAt(record.schema, `${path}.schema`, state, 1);
        if (!isJsonEventSchema(schema)) {
            throw new ReleaseValidationError(
                "invalid_schema",
                "event schemas must contain only JSON values",
                `${path}.schema`,
            );
        }
        const description = optionalString(record.description, `${path}.description`, "invalid_contract", 4096);
        const docs =
            record.docs === undefined
                ? undefined
                : expectArray(record.docs, `${path}.docs`, "invalid_contract").map((doc, i) =>
                      expectString(doc, `${path}.docs[${i}]`, "invalid_contract", 512),
                  );
        if (docs && (docs.length > 32 || new Set(docs).size !== docs.length)) {
            throw new ReleaseValidationError(
                "invalid_contract",
                "event documentation references must be bounded and unique",
                `${path}.docs`,
            );
        }
        const filterKeys = parseFilterKeys(record.filterKeys, schema, `${path}.filterKeys`);
        return {
            ...(filterKeys ? { filterKeys } : {}),
            id: parseIdentifier(record.id, `${path}.id`),
            schema,
            sensitive: expectBoolean(record.sensitive, `${path}.sensitive`, "invalid_contract"),
            ...(description === undefined ? {} : { description }),
            ...(docs === undefined ? {} : { docs }),
            ...(record.deprecation === undefined
                ? {}
                : { deprecation: parseCapabilityDeprecation(record.deprecation, `${path}.deprecation`) }),
        };
    });
    if (new Set(events.map(({ id }) => id)).size !== events.length) {
        throw new ReleaseValidationError("invalid_contract", "contains duplicate event IDs", "$.events");
    }
    validateDeprecationReferences(events, unresolvedParent, "events");
    return events;
}
