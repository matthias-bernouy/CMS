import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { IntegrationCompatibilityAdmissionReport, TrustedSchemaDeclarationEvidence } from "../compatibility";
import type { IntegrationRegistryCatalogSnapshot } from "../catalog";

export type IntegrationRegistryPublicationRequest = Readonly<{
    package: ResolvedIntegrationPackage;
    schemaDeclarationEvidence?: readonly TrustedSchemaDeclarationEvidence[];
}>;

export type IntegrationRegistryPublicationResult = Readonly<{
    operationId: string;
    kind: string;
    version: string;
    digest: string;
    report: IntegrationCompatibilityAdmissionReport;
    snapshot: IntegrationRegistryCatalogSnapshot;
}>;

export interface IntegrationRegistryPublisher {
    publish(request: IntegrationRegistryPublicationRequest): Promise<IntegrationRegistryPublicationResult>;
}
