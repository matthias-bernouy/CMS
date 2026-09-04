import type { ReviewedConnectorSchemaBaseline } from "@bernouy/cms-integration-registry";

export type PublicRepositorySchemaBaseline = ReviewedConnectorSchemaBaseline;

export type RepositorySchemaBaselineReader = Readonly<{
    listForPackage(
        kind: string,
        version: string,
        packageDigest: string,
    ): Promise<readonly PublicRepositorySchemaBaseline[]>;
}>;
