import type { ContractRelease } from "../../../interfaces/ContractRelease";
import type { CatalogueContractRelease } from "../../../interfaces/ReleaseCatalogue";
import type { ReleaseLimits } from "../../protocol/limits";
import { ReleaseValidationError } from "../../protocol/errors";
import { compareSemVer, isSemVerPrerelease, semVerMajor } from "../../compatibility/semver";
import { effectiveCapabilities } from "./effective";
import { assertStableIdentity } from "./identity";

/** Single-release admission has no historical proof. Publication enforces the known stable lineage. */
export function verifyCapabilityLifecycle(
    next: ContractRelease,
    published: readonly CatalogueContractRelease[],
    ancestry: readonly CatalogueContractRelease[],
    limits: Readonly<ReleaseLimits>,
): void {
    const history = published
        .map(({ admission }) => admission.release)
        .filter(
            (release) =>
                release.contractId === next.contractId &&
                !isSemVerPrerelease(release.version) &&
                compareSemVer(release.version, next.version) < 0,
        )
        .sort((left, right) => compareSemVer(right.version, left.version));
    const index = new Map(
        ancestry.map(({ admission }) => [`${admission.release.contractId}@${admission.release.version}`, admission]),
    );
    const after = effectiveCapabilities(next, index);
    for (const { admission } of published) {
        const future = admission.release;
        if (
            future.contractId !== next.contractId ||
            isSemVerPrerelease(future.version) ||
            compareSemVer(future.version, next.version) <= 0
        ) {
            continue;
        }
        const futureCapabilities = effectiveCapabilities(future, index);
        for (const [id, capability] of after) {
            const stable = futureCapabilities.get(id);
            if (stable) {
                assertStableIdentity(capability, stable, limits);
            }
        }
    }
    const previous = history[0];
    if (!previous) {
        return;
    }
    const before = effectiveCapabilities(previous, index);
    for (const [id, capability] of before) {
        const path = `$.capabilities[${JSON.stringify(id)}]`;
        const replacement = after.get(id);
        if (!replacement) {
            const successor = capability.deprecation?.replacedBy;
            if (
                semVerMajor(next.version) === semVerMajor(previous.version) ||
                (!capability.deprecation?.retirement && (!successor || !before.has(successor) || !after.has(successor)))
            ) {
                reject(
                    `removing ${id} requires a major release and a previously published deprecation with a retained replacement or explicit retirement`,
                    path,
                );
            }
            continue;
        }
        assertStableIdentity(capability, replacement, limits);
    }
    const introduced = [...after.keys()].filter((id) => !before.has(id));
    if (introduced.length) {
        for (const historical of history.slice(1)) {
            const view = effectiveCapabilities(historical, index);
            for (const id of introduced) {
                if (view.has(id)) {
                    reject(
                        `retired capability identifier ${id} cannot be reused`,
                        `$.capabilities[${JSON.stringify(id)}]`,
                    );
                }
            }
        }
    }
}
function reject(message: string, path: string): never {
    throw new ReleaseValidationError("invalid_contract", message, path);
}
