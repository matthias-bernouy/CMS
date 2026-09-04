import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type {
    ReviewedConnectorSchemaBaseline,
    StoredIntegrationVerificationBundle,
} from "@bernouy/cms-integration-registry";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export type LocalReleasePackage = Readonly<{
    package: ResolvedIntegrationPackage;
    definition: IntegrationDefinition;
    verification?: StoredIntegrationVerificationBundle;
    reviewedSchemaBaselines?: readonly ReviewedConnectorSchemaBaseline[];
}>;

export type LocalReleaseVerificationInput = Readonly<{
    candidate: LocalReleasePackage;
    sourceRoot: string;
    baselines: readonly LocalReleasePackage[];
    availablePackages: readonly LocalReleasePackage[];
}>;

export type LocalReleaseVerificationResult = Readonly<{
    scenarioCount: number;
    resilienceScenarioCount: number;
}>;

export interface LocalReleaseVerifier {
    verify(input: LocalReleaseVerificationInput): Promise<LocalReleaseVerificationResult | void>;
}
