import { type IntegrationPackageLimits, resolveIntegrationPackageLimits } from "@bernouy/cms-integration-packages";
import type { FsIntegrationRegistryPublicationPhase } from "../../persistence/journal";

const phaseOrder = new Map<FsIntegrationRegistryPublicationPhase, number>([
    ["staged", 0],
    ["version-live", 1],
    ["manifest-written", 2],
    ["report-written", 3],
    ["index-written", 4],
    ["snapshot-swapped", 5],
]);

export function publicationPhaseAtLeast(
    actual: FsIntegrationRegistryPublicationPhase,
    expected: FsIntegrationRegistryPublicationPhase,
): boolean {
    return phaseOrder.get(actual)! >= phaseOrder.get(expected)!;
}

export function resolvedRecoveryPackageLimits(
    overrides: Partial<IntegrationPackageLimits> | undefined,
): Readonly<IntegrationPackageLimits> {
    return resolveIntegrationPackageLimits(overrides);
}
