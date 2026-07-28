import type { IntegrationRegistryCatalogSnapshot } from "../catalog";

export type IntegrationRegistryPublicationResult = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    digest: string;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;
