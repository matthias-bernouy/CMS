import type {
    DeclarativeConnectorSchemaConstraintContract,
    DeclarativeConnectorSchemaContract,
    ObservedSchemaConstraintV1,
    ObservedSchemaContractV1,
    ObservedSchemaOwnerV1,
} from "../../../../../interfaces/Integration";
import { OBSERVED_SCHEMA_CONTRACT_V1 } from "../../../../../interfaces/Integration";
import { parseObservedSchemaContractV1 } from "./parse";

export function materializeObservedSchemaContract(
    schema: DeclarativeConnectorSchemaContract,
    owner: ObservedSchemaOwnerV1,
): ObservedSchemaContractV1 {
    return parseObservedSchemaContractV1({
        schema: OBSERVED_SCHEMA_CONTRACT_V1,
        owner,
        namespaces: schema.namespaces.map((namespace) => ({
            name: namespace.name,
            relations: namespace.relations.map((relation) => ({
                name: relation.name,
                kind: relation.kind ?? "table",
                columns: relation.columns.map((column) => ({
                    name: column.name,
                    type: column.type,
                    nullable: column.nullable,
                    ...(column.default === undefined ? {} : { default: column.default }),
                    identity: column.identity ?? "none",
                    generated: column.generated ?? "none",
                    sequenceDependency: column.sequenceDependency ?? "none",
                })),
                constraints: relation.constraints.map(materializeConstraint),
            })),
        })),
    });
}

function materializeConstraint(constraint: DeclarativeConnectorSchemaConstraintContract): ObservedSchemaConstraintV1 {
    return {
        ...constraint,
        deferrable: constraint.deferrable ?? false,
        initiallyDeferred: constraint.initiallyDeferred ?? false,
        validated: constraint.validated ?? true,
        ...(constraint.kind === "foreign-key" ? { matchType: constraint.matchType ?? "simple" } : {}),
    } as ObservedSchemaConstraintV1;
}
