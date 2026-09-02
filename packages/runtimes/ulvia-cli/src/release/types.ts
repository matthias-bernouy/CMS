import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export type LocalReleasePackage = Readonly<{
    package: ResolvedIntegrationPackage;
    definition: IntegrationDefinition;
}>;

export type LocalReleaseVerificationInput = Readonly<{
    candidate: LocalReleasePackage;
    baselines: readonly LocalReleasePackage[];
    availablePackages: readonly LocalReleasePackage[];
}>;

export interface LocalReleaseVerifier {
    verify(input: LocalReleaseVerificationInput): Promise<void>;
}
