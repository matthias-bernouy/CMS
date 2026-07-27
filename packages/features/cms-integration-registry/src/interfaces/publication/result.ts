import type { IntegrationCompatibilityAdmissionReport } from "../compatibility";
import type { IntegrationRegistryCatalogSnapshot } from "../catalog";

export type IntegrationRegistryPublicationResult = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    digest: string;
    report: IntegrationCompatibilityAdmissionReport;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;
