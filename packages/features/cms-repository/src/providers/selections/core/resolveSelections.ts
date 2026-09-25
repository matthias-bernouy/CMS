import type { ContractRelease } from "cms-repository/exports/contracts/index";
import { deepFreeze } from "cms-repository/exports/contracts/protocol";
import { parseProviderInstallation } from "cms-repository/providers/installations/core/parsing/parseProviderInstallation";
import { validateProviderInstallation } from "cms-repository/providers/installations/core/validateProviderInstallation";
import type { ProviderInstallationLimits } from "cms-repository/providers/installations/core/limits";
import type { ProviderInstallation } from "cms-repository/providers/installations/interfaces/ProviderInstallation";
import type { ProviderContractImplementation } from "cms-repository/providers/manifests/interfaces/ProviderManifest";
import { expectArray } from "cms-repository/providers/manifests/core/values";
import type { ContractSelection } from "../interfaces/ContractSelection";
import type { ContractSelectionContext } from "../interfaces/ContractSelectionPlan";
import { ContractSelectionValidationError } from "./errors";
import type { ContractSelectionLimits } from "./limits";

export interface ResolvedSelection {
    readonly selection: ContractSelection;
    readonly release: ContractRelease;
    readonly implementation: ProviderContractImplementation;
}

export function snapshotInstallations(
    installations: readonly ProviderInstallation[],
    limits: Readonly<ContractSelectionLimits>,
    installationLimits: Readonly<ProviderInstallationLimits>,
): ReadonlyMap<string, ProviderInstallation> {
    if (Array.isArray(installations) && installations.length > limits.maxInstallations) {
        throw new ContractSelectionValidationError("limit_exceeded", "too many installation snapshots");
    }
    const result = new Map<string, ProviderInstallation>();
    for (const value of expectArray(installations, "$.installations", limits.maxInstallations)) {
        const installation = parseProviderInstallation(value, installationLimits);
        if (result.has(installation.id)) {
            throw new ContractSelectionValidationError("invalid_selection", "duplicate installation snapshot ID");
        }
        result.set(installation.id, installation);
    }
    return result;
}

export async function resolveSelections(
    selections: readonly ContractSelection[],
    context: ContractSelectionContext,
    installations: ReadonlyMap<string, ProviderInstallation>,
): Promise<ReadonlyMap<string, ResolvedSelection>> {
    const resolved = new Map<string, ResolvedSelection>();
    for (const selection of selections) {
        const path = `$.selections.${selection.contractId}`;
        const installation = installations.get(selection.installationId);
        if (!installation || installation.status !== "enabled") {
            throw new ContractSelectionValidationError(
                "installation_unavailable",
                "installation must be enabled",
                path,
            );
        }
        if (installation.siteId !== selection.siteId) {
            throw new ContractSelectionValidationError(
                "cross_site_selection",
                "installation belongs to another site",
                path,
            );
        }
        const manifestRecord = await context.manifests.get(
            installation.providerId,
            installation.approval.manifestVersion,
        );
        if (!manifestRecord || manifestRecord.admission.digest !== installation.approval.manifestDigest) {
            throw new ContractSelectionValidationError(
                "manifest_mismatch",
                "approved manifest pin is not published",
                path,
            );
        }
        // V1 replacements require every proposed pin to be currently non-yanked, including retained pins.
        if (manifestRecord.yank) {
            throw new ContractSelectionValidationError("yanked_dependency", "approved manifest is yanked", path);
        }
        const manifest = deepFreeze(structuredClone(manifestRecord.admission));
        validateProviderInstallation(installation, manifest, context.installationLimits);
        const record = await context.releases.get(selection.contractId, selection.version);
        if (
            !record ||
            record.admission.digest !== selection.digest ||
            record.admission.release.contractId !== selection.contractId ||
            record.admission.release.version !== selection.version
        ) {
            throw new ContractSelectionValidationError("release_mismatch", "exact release pin is not published", path);
        }
        if (record.yank) {
            throw new ContractSelectionValidationError("yanked_dependency", "selected release is yanked", path);
        }
        const implementation = manifest.manifest.implementations.find(
            (item) =>
                item.contractId === selection.contractId &&
                item.version === selection.version &&
                item.digest === selection.digest,
        );
        if (!implementation) {
            throw new ContractSelectionValidationError(
                "release_mismatch",
                "approved manifest does not serve the exact release",
                path,
            );
        }
        resolved.set(selection.contractId, {
            selection,
            release: deepFreeze(structuredClone(record.admission.release)),
            implementation,
        });
    }
    return resolved;
}
