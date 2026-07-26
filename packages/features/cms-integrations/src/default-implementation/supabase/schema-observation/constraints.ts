import type {
    DeclarativeConnectorSchemaForeignKeyAction,
    ObservedSchemaConstraintV1,
} from "../../../interfaces/IntegrationConnectorDeployer";
import type { MutableObservedNamespace } from "./types";
import { requiredRelation } from "./relations";
import { rowBoolean, rowOptionalBoolean, rowOptionalText, rowText, rowTextArray } from "./values";

export function addObservedConstraints(
    namespaces: Map<string, MutableObservedNamespace>,
    rows: readonly Record<string, unknown>[],
): void {
    for (const row of rows) {
        const relation = requiredRelation(namespaces, row);
        const constraint = parseConstraint(row);
        if (relation.constraints.some((entry) => entry.name === constraint.name)) {
            throw new TypeError(`PostgreSQL returned duplicate constraint "${constraint.name}"`);
        }
        relation.constraints.push(constraint);
    }
}

function parseConstraint(row: Record<string, unknown>): ObservedSchemaConstraintV1 {
    const kind = rowText(row, "constraint_type");
    const common = {
        name: rowText(row, "constraint_name"),
        deferrable: rowBoolean(row, "deferrable"),
        initiallyDeferred: rowBoolean(row, "initially_deferred"),
        validated: rowBoolean(row, "validated"),
    };
    if (kind === "p") {
        return { kind: "primary-key", ...common, columns: rowTextArray(row, "local_columns") };
    }
    if (kind === "u") {
        const nullsNotDistinct = rowOptionalBoolean(row, "nulls_not_distinct");
        if (nullsNotDistinct === undefined) {
            throw new TypeError("PostgreSQL unique constraint is missing pg_index.indnullsnotdistinct");
        }
        return { kind: "unique", ...common, columns: rowTextArray(row, "local_columns"), nullsNotDistinct };
    }
    if (kind === "f") {
        return foreignKey(row, common);
    }
    if (kind === "c") {
        const expression = rowOptionalText(row, "check_expression");
        if (!expression) {
            throw new TypeError("PostgreSQL check constraint is missing its catalog expression");
        }
        return { kind: "check", ...common, expression };
    }
    throw new TypeError(`Unsupported PostgreSQL constraint type "${kind}"`);
}

function foreignKey(
    row: Record<string, unknown>,
    common: Pick<ObservedSchemaConstraintV1, "name" | "deferrable" | "initiallyDeferred" | "validated">,
): ObservedSchemaConstraintV1 {
    const namespace = rowOptionalText(row, "referenced_namespace_name");
    const relation = rowOptionalText(row, "referenced_relation_name");
    if (!namespace || !relation) {
        throw new TypeError("PostgreSQL foreign key is missing its referenced relation");
    }
    return {
        kind: "foreign-key",
        ...common,
        columns: rowTextArray(row, "local_columns"),
        references: { namespace, relation, columns: rowTextArray(row, "referenced_columns") },
        onUpdate: foreignKeyAction(rowOptionalText(row, "update_action_code"), "update"),
        onDelete: foreignKeyAction(rowOptionalText(row, "delete_action_code"), "delete"),
        matchType: matchType(rowOptionalText(row, "match_type_code")),
    };
}

function foreignKeyAction(value: string | undefined, label: string): DeclarativeConnectorSchemaForeignKeyAction {
    const actions = { a: "no-action", r: "restrict", c: "cascade", n: "set-null", d: "set-default" } as const;
    const action = value ? actions[value as keyof typeof actions] : undefined;
    if (!action) {
        throw new TypeError(`Unsupported PostgreSQL foreign-key ${label} action "${value ?? ""}"`);
    }
    return action;
}

function matchType(value: string | undefined): "simple" | "full" | "partial" {
    const matches = { s: "simple", f: "full", p: "partial" } as const;
    const match = value ? matches[value as keyof typeof matches] : undefined;
    if (!match) {
        throw new TypeError(`Unsupported PostgreSQL foreign-key match type "${value ?? ""}"`);
    }
    return match;
}
