import type { ContractRelease } from "ulvia-contracts/interfaces/ContractRelease";
import type { ContractEventDefinition } from "ulvia-contracts/interfaces/ContractEvent";
import type { CatalogueContractRelease } from "ulvia-contracts/interfaces/ContractReleaseReader";
import type { ReleaseLimits } from "ulvia-contracts/core/protocol/limits";
import { effectiveEvents } from "ulvia-contracts/core/catalogue/lifecycle/effective";
import { firstRemovedField } from "ulvia-contracts/core/catalogue/lifecycle/fields";
import { compareSemVer, isSemVerPrerelease, semVerMajor } from "ulvia-contracts/core/compatibility/semver";
import { ReleaseValidationError } from "ulvia-contracts/core/protocol/errors";
import { compareEvent } from "./compare";

export function verifyEventLifecycle(
    next: ContractRelease,
    published: readonly CatalogueContractRelease[],
    ancestry: readonly CatalogueContractRelease[],
    limits: Readonly<ReleaseLimits>,
): void {
    const stable = published
        .map(({ admission }) => admission.release)
        .filter((release) => release.contractId === next.contractId && !isSemVerPrerelease(release.version))
        .sort((a, b) => compareSemVer(b.version, a.version));
    const index = new Map(
        ancestry.map(({ admission }) => [`${admission.release.contractId}@${admission.release.version}`, admission]),
    );
    const after = effectiveEvents(next, index);
    for (const future of stable.filter((release) => compareSemVer(release.version, next.version) > 0)) {
        const view = effectiveEvents(future, index);
        for (const [id, event] of after) {
            const retained = view.get(id);
            if (retained) {
                assertIdentity(event, retained, limits.maxJsonDepth);
            }
        }
    }
    const history = stable.filter((release) => compareSemVer(release.version, next.version) < 0);
    const previous = history[0];
    if (!previous) {
        return;
    }
    const before = effectiveEvents(previous, index);
    for (const [id, event] of before) {
        const replacement = after.get(id);
        if (replacement) {
            assertIdentity(event, replacement, limits.maxJsonDepth);
        } else {
            const successor = event.deprecation?.replacedBy;
            if (
                semVerMajor(next.version) === semVerMajor(previous.version) ||
                (!event.deprecation?.retirement && (!successor || !before.has(successor) || !after.has(successor)))
            ) {
                reject(id, "removal requires a major and a previously published retirement or retained replacement");
            }
        }
    }
    const introduced = [...after.keys()].filter((id) => !before.has(id));
    for (const old of history.slice(1)) {
        const view = effectiveEvents(old, index);
        for (const id of introduced) {
            if (view.has(id)) {
                reject(id, "retired event IDs cannot be reused");
            }
        }
    }
}

function assertIdentity(before: ContractEventDefinition, after: ContractEventDefinition, maxDepth: number): void {
    if (
        firstRemovedField(before.schema, after.schema, "$.schema") ||
        compareEvent(before, after, maxDepth).some((issue) => issue.requiredBump === "major")
    ) {
        reject(before.id, "breaking changes require a new event ID and deprecation of the previous event");
    }
}
function reject(id: string, message: string): never {
    throw new ReleaseValidationError("invalid_contract", `event ${id}: ${message}`, `$.events[${JSON.stringify(id)}]`);
}
