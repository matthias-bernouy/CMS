import type {
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaContract,
    ObservedSchemaConstraintV1,
    ObservedSchemaContractV1,
} from "../../../../../interfaces/Integration";
import { parseConnectorSchemaContract } from "../schema";
import { parseObservedSchemaContractV1 } from "./parse";

export function projectObservedSchemaContract(value: unknown): DeclarativeConnectorSchemaContract {
    const observed = parseObservedSchemaContractV1(value);
    return parseConnectorSchemaContract(
        {
            namespaces: observed.namespaces.map((namespace) => ({
                name: namespace.name,
                relations: namespace.relations.map((relation) => ({
                    name: relation.name,
                    kind: relation.kind,
                    columns: relation.columns.map((column) => ({
                        name: column.name,
                        type: column.type,
                        nullable: column.nullable,
                        ...(column.default !== undefined ? { default: column.default } : {}),
                        ...(column.identity !== "none" ? { identity: column.identity } : {}),
                        ...(column.generated !== "none" ? { generated: column.generated } : {}),
                        ...(column.sequenceDependency !== "none"
                            ? { sequenceDependency: column.sequenceDependency }
                            : {}),
                    })),
                    constraints: relation.constraints.map(projectConstraint),
                })),
            })),
        },
        "supabase",
        "observedSchema.projection",
    );
}

function projectConstraint(constraint: ObservedSchemaConstraintV1): DeclarativeConnectorSchemaConstraintContract {
    const common = {
        deferrable: constraint.deferrable,
        initiallyDeferred: constraint.initiallyDeferred,
        validated: constraint.validated,
    };
    if (constraint.kind === "foreign-key") {
        return {
            ...constraint,
            ...common,
            references: { ...constraint.references, columns: [...constraint.references.columns] },
            columns: [...constraint.columns],
        };
    }
    if (constraint.kind === "check") {
        return { ...constraint, ...common };
    }
    return { ...constraint, ...common, columns: [...constraint.columns] };
}
