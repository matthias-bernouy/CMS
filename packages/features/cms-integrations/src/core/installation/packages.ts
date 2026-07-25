import { IntegrationInputError, IntegrationRepositoryContractError, IntegrationRuntimeError } from "../errors";
import { isExactIntegrationVersion } from "../definitions/versioning";
import { definitionSnapshotsEqual } from "./snapshots";
import type { IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationImportDeps } from "../../interfaces/IntegrationImport";
import type { IntegrationInstallation } from "../../interfaces/IntegrationInstallation";
import type {
    IntegrationPackageResolver,
    IntegrationPackageResolutionReason,
    ResolvedIntegrationPackageRoot,
} from "../../interfaces/IntegrationConnectorDeployer";

type ResolvePackageOptions = {
    resolver?: IntegrationPackageResolver;
    kind: string;
    version: string;
    reason: IntegrationPackageResolutionReason;
    expectedDigest?: string;
    expectedDefinition?: IntegrationDefinition;
    allowEmbeddedFallback: boolean;
};

export async function resolveCreatePackage(
    resolver: IntegrationPackageResolver | undefined,
    definition: IntegrationDefinition,
): Promise<ResolvedIntegrationPackageRoot | undefined> {
    if (!resolver) {
        return undefined;
    }
    if (!definition.version || !isExactIntegrationVersion(definition.version)) {
        throw new IntegrationInputError("version", "package-backed installations require an exact version");
    }
    return resolvePackage({
        resolver,
        kind: definition.kind,
        version: definition.version,
        reason: "create",
        expectedDefinition: definition,
        allowEmbeddedFallback: false,
    });
}

export async function resolveRerunPackage(
    resolver: IntegrationPackageResolver | undefined,
    installation: IntegrationInstallation,
): Promise<ResolvedIntegrationPackageRoot | undefined> {
    if (!resolver) {
        assertPinnedResolverAvailable(installation);
        return undefined;
    }
    if (!isExactIntegrationVersion(installation.definitionVersion)) {
        return undefined;
    }
    return resolvePackage({
        resolver,
        kind: installation.id,
        version: installation.definitionVersion,
        reason: "rerun",
        expectedDigest: installation.packageDigest,
        expectedDefinition: installation.definitionSnapshot,
        allowEmbeddedFallback: !installation.packageDigest,
    });
}

export async function resolveUpgradePackage(
    resolver: IntegrationPackageResolver | undefined,
    installation: IntegrationInstallation,
    definition: IntegrationDefinition,
): Promise<ResolvedIntegrationPackageRoot | undefined> {
    if (!resolver) {
        assertPinnedResolverAvailable(installation);
        return undefined;
    }
    return resolvePackage({
        resolver,
        kind: definition.kind,
        version: definition.version as string,
        reason: "upgrade",
        expectedDefinition: definition,
        allowEmbeddedFallback: false,
    });
}

export function depsWithPackageRoot(
    deps: IntegrationImportDeps,
    resolved: ResolvedIntegrationPackageRoot | undefined,
): IntegrationImportDeps {
    return resolved ? { ...deps, packageRoot: resolved.root } : deps;
}

async function resolvePackage(options: ResolvePackageOptions): Promise<ResolvedIntegrationPackageRoot> {
    const resolved = await options.resolver!.resolve({
        kind: options.kind,
        version: options.version,
        reason: options.reason,
        expectedDigest: options.expectedDigest,
        expectedDefinition: options.expectedDefinition,
        allowEmbeddedFallback: options.allowEmbeddedFallback,
    });
    if (
        resolved.kind !== options.kind ||
        resolved.version !== options.version ||
        resolved.definition.kind !== options.kind ||
        resolved.definition.version !== options.version ||
        !/^[a-f0-9]{64}$/.test(resolved.digest) ||
        !resolved.root.trim() ||
        (options.expectedDigest && resolved.digest !== options.expectedDigest) ||
        (options.expectedDefinition && !definitionSnapshotsEqual(resolved.definition, options.expectedDefinition))
    ) {
        throw new IntegrationRepositoryContractError();
    }
    return resolved;
}

function assertPinnedResolverAvailable(installation: IntegrationInstallation): void {
    if (installation.packageDigest) {
        throw new IntegrationRuntimeError("integration package resolver is required for a pinned installation");
    }
}
