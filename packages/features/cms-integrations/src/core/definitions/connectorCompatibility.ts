import { IntegrationInputError } from "../errors";
import type { IntegrationDefinition } from "../../interfaces/Integration";

/**
 * Applies the management admission rule without making the field mandatory for
 * legacy definitions and persisted installation snapshots.
 */
export function assertSqlConnectorSchemaCompatibilityDeclared(definition: IntegrationDefinition): void {
    for (const [index, connector] of (definition.connectors ?? []).entries()) {
        if ((connector.schemas?.length ?? 0) === 0) {
            continue;
        }
        if (!connector.compatibility?.schema) {
            throw new IntegrationInputError(
                `definition.connectors.${index}.compatibility.schema`,
                "is required when the connector deploys SQL schemas",
            );
        }
    }
}
