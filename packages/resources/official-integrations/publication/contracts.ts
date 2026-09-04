import type { ResolvedIntegrationPackage } from "@bernouy/cms-integration-packages";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

export type OfficialIntegrationPackage = Readonly<{
    kind: string;
    version: string;
    digest: string;
    canonicalBytes: Uint8Array;
}>;

export type BuiltOfficialIntegrationPackage = OfficialIntegrationPackage &
    Readonly<{ package: ResolvedIntegrationPackage; definition: IntegrationDefinition; sourceRoot?: string }>;
