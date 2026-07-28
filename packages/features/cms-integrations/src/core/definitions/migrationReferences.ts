import type { DeclarativeConnectorMigrationReference } from "../../interfaces/IntegrationConnectorDeployer";

export function sameConnectorMigrationReferences(
    left: readonly DeclarativeConnectorMigrationReference[],
    right: readonly DeclarativeConnectorMigrationReference[],
): boolean {
    return (
        left.length === right.length &&
        left.every((entry, index) => {
            const reference = right[index];
            return (
                entry.id === reference?.id &&
                entry.checksum === reference.checksum &&
                entry.revision === reference.revision &&
                entry.introducedIn === reference.introducedIn
            );
        })
    );
}
