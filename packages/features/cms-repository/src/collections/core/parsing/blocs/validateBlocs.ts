import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { validateMarkup } from "../../validation/markup/validateMarkup";

function validateUsesGraph(blocs: readonly CollectionBloc[], byId: ReadonlyMap<string, CollectionBloc>): void {
    const dependents = new Map(blocs.map((bloc) => [bloc.id, [] as string[]]));
    const remaining = new Map(blocs.map((bloc) => [bloc.id, bloc.uses.length]));
    const ready = blocs.filter((bloc) => bloc.uses.length === 0).map((bloc) => bloc.id);
    for (const bloc of blocs) {
        for (const id of bloc.uses) {
            if (!byId.has(id)) {
                invalid(`unknown local bloc ${id}`, `$.blocs[${bloc.id}].uses`);
            }
            dependents.get(id)!.push(bloc.id);
        }
    }
    let resolved = 0;
    while (ready.length > 0) {
        const id = ready.pop()!;
        resolved += 1;
        for (const dependent of dependents.get(id)!) {
            const count = remaining.get(dependent)! - 1;
            remaining.set(dependent, count);
            if (count === 0) {
                ready.push(dependent);
            }
        }
    }
    if (resolved !== blocs.length) {
        const cycle = blocs.filter((bloc) => remaining.get(bloc.id)! > 0).map((bloc) => bloc.id);
        invalid(`cyclic bloc uses involving ${cycle.join(", ")}`, "$.blocs");
    }
}

export function validateBlocs(
    blocs: readonly CollectionBloc[],
    assetIds: ReadonlySet<string>,
    limits: Readonly<CollectionLimits>,
): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of blocs) {
        const path = `$.blocs[${bloc.id}]`;
        if (bloc.thumbnail !== undefined && !assetIds.has(bloc.thumbnail)) {
            invalid(`unknown thumbnail asset ${bloc.thumbnail}`, `${path}.thumbnail`);
        }
        for (const [name, slot] of Object.entries(bloc.slots)) {
            for (const id of slot.accepts ?? []) {
                if (!byId.has(id)) {
                    invalid(`unknown accepted bloc ${id}`, `${path}.slots.${name}.accepts`);
                }
            }
        }
    }
    validateUsesGraph(blocs, byId);
    validateMarkup(blocs, limits);
}
