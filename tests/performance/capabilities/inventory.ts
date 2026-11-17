import { createHash } from "node:crypto";
import { compileOfficialFeatures, compileRetainedFeatures } from "@bernouy/ulvia-provider/build";
import type { CompiledImplementations } from "@bernouy/ulvia-sdk";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";
import type { CapabilityInventory, CapabilityTarget } from "./types";

type Build = Pick<CompiledImplementations<unknown>, "contracts" | "implementations" | "implementedContracts">;

export function capabilityKey(release: ContractParentReference, capabilityId: string): string {
    return `${release.contractId}@${release.version}#${release.digest}:${capabilityId}`;
}

/** The compiled SDK views are the same exact views consumed by handler registration. */
export function inventoryFromBuilds(current: Build, retained: readonly Build[] = []): CapabilityInventory {
    const targets = new Map<string, CapabilityTarget>();
    const implemented = new Set<string>();
    for (const [index, build] of [current, ...retained].entries()) {
        for (const claim of build.implementations) {
            const view = build.implementedContracts.find(
                (candidate) =>
                    candidate.release.contractId === claim.contractId &&
                    candidate.release.version === claim.version &&
                    candidate.digest === claim.digest,
            );
            if (!view) {
                throw new Error(`SDK implementation has no resolved execution view: ${claim.contractId}`);
            }
            implemented.add(claim.digest);
            for (const capability of view.capabilities) {
                const release = { contractId: claim.contractId, version: claim.version, digest: claim.digest };
                const key = capabilityKey(release, capability.definition.id);
                if (targets.has(key)) {
                    if (index === 0) {
                        throw new Error(`Duplicate executable capability: ${key}`);
                    }
                    continue;
                }
                if (!capability.definition.bindings.length) {
                    throw new Error(`Executable capability has no binding: ${key}`);
                }
                targets.set(key, {
                    key,
                    release,
                    owner: capability.owner,
                    definition: capability.definition,
                    retained: index !== 0,
                });
            }
        }
    }
    const inherited = new Set(
        current.implementedContracts.flatMap((view) => view.lineage.map((entry) => entry.digest)),
    );
    const templates = current.contracts
        .filter((entry) => !implemented.has(entry.digest) && !inherited.has(entry.digest))
        .map(({ release, digest }) => ({
            release: { contractId: release.contractId, version: release.version, digest },
            capabilityIds: release.capabilities.map(({ id }) => id).toSorted(),
        }))
        .sort((a, b) => a.release.contractId.localeCompare(b.release.contractId));
    const sorted = [...targets.values()].sort((a, b) => a.key.localeCompare(b.key));
    const fingerprint = createHash("sha256")
        .update(JSON.stringify({ targets: sorted, templates }))
        .digest("hex");
    return { fingerprint, targets: sorted, templates };
}

export async function officialCapabilityInventory(): Promise<CapabilityInventory> {
    return inventoryFromBuilds(await compileOfficialFeatures(), await compileRetainedFeatures());
}

/** A focused report names its exact current target; it cannot claim repository-wide coverage. */
export function scopedInventory(
    inventory: CapabilityInventory,
    scope: { contractId: string; capabilityId: string },
): CapabilityInventory {
    const targets = inventory.targets.filter(
        (target) =>
            !target.retained &&
            target.release.contractId === scope.contractId &&
            target.definition.id === scope.capabilityId,
    );
    if (targets.length !== 1) {
        throw new Error("Performance scope must resolve to one exact current execution target");
    }
    return {
        targets,
        templates: [],
        fingerprint: createHash("sha256")
            .update(JSON.stringify({ source: inventory.fingerprint, targets }))
            .digest("hex"),
    };
}
