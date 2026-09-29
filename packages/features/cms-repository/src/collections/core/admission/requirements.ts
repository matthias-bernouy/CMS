import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionBloc } from "../../interfaces/CollectionBloc";
import { CollectionValidationError } from "../errors";

/** Each resource and its used blocs need joint witnesses; unrelated resources stay independent. */
export async function verifyCollectionRequirements(
    release: CollectionRelease,
    catalogue?: ReleaseCatalogue,
): Promise<void> {
    const blocs = new Map(release.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of release.blocs) {
        const closure = usedBlocs(bloc, blocs).flatMap((item) => item.requires);
        for (const contractId of new Set(closure.map((requirement) => requirement.contractId))) {
            const requirements = closure.filter((requirement) => requirement.contractId === contractId);
            const entries = catalogue ? await catalogue.list(contractId) : [];
            const witness = entries.some((entry) => {
                const contract = entry.admission.release;
                return (
                    !entry.yank &&
                    contract.contractId === contractId &&
                    requirements.every(
                        (requirement) =>
                            satisfiesVersionRange(contract.version, requirement.versionRange) &&
                            contract.capabilities.some((capability) => capability.id === requirement.capabilityId),
                    )
                );
            });
            if (!witness) {
                throw new CollectionValidationError(
                    "resolution_failed",
                    `no non-yanked ${contractId} release jointly satisfies this bloc and its used blocs`,
                    `$.blocs.${bloc.id}.requires`,
                );
            }
        }
    }
}

function usedBlocs(root: CollectionBloc, blocs: ReadonlyMap<string, CollectionBloc>): CollectionBloc[] {
    const seen = new Set<string>();
    const pending = [root];
    const result: CollectionBloc[] = [];
    while (pending.length > 0) {
        const bloc = pending.pop()!;
        if (seen.has(bloc.id)) {
            continue;
        }
        seen.add(bloc.id);
        result.push(bloc);
        for (const id of bloc.uses) {
            pending.push(blocs.get(id)!);
        }
    }
    return result;
}
