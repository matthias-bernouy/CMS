import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionRelease } from "../../interfaces/CollectionRelease";
import type { CollectionBloc } from "../../interfaces/CollectionBloc";
import type { CollectionCapabilityRequirement } from "../../interfaces/CollectionRelease";
import { CollectionValidationError } from "../errors";
import { parseQuery } from "@bernouy/cms-content/bindings";
import { parseHTML } from "linkedom";

/** Each resource and its used blocs need joint witnesses; unrelated resources stay independent. */
export async function verifyCollectionRequirements(
    release: CollectionRelease,
    catalogue?: ReleaseCatalogue,
): Promise<void> {
    const blocs = new Map(release.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of release.blocs) {
        const used = usedBlocs(bloc, blocs);
        const closure = used.flatMap((item) => item.requires);
        await verifyRequirements(
            closure,
            queryTargets(used.map((item) => item.lightdom ?? "")),
            `$.blocs.${bloc.id}.requires`,
            "this bloc and its used blocs",
            catalogue,
        );
    }
    for (const page of release.pages ?? []) {
        const used = page.uses.flatMap((id) => {
            const bloc = blocs.get(id);
            return bloc ? usedBlocs(bloc, blocs) : [];
        });
        const closure = [...page.requires, ...used.flatMap((item) => item.requires)];
        await verifyRequirements(
            closure,
            queryTargets([page.document.html, ...used.map((item) => item.lightdom ?? "")]),
            `$.pages.${page.id}.requires`,
            "this page and its used blocs",
            catalogue,
        );
    }
}

async function verifyRequirements(
    closure: readonly CollectionCapabilityRequirement[],
    queries: ReadonlySet<string>,
    path: string,
    owner: string,
    catalogue?: ReleaseCatalogue,
): Promise<void> {
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
                        contract.capabilities.some(
                            (capability) =>
                                capability.id === requirement.capabilityId &&
                                (!queries.has(`${contractId}/${requirement.capabilityId}`) ||
                                    (capability.behavior.effect === "query" && capability.output.type !== "binary")),
                        ),
                )
            );
        });
        if (!witness) {
            throw new CollectionValidationError(
                "resolution_failed",
                `no non-yanked ${contractId} release jointly satisfies ${owner}`,
                path,
            );
        }
    }
}

function queryTargets(markups: readonly string[]): ReadonlySet<string> {
    const targets = new Set<string>();
    for (const html of markups) {
        const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
        document.body.innerHTML = html;
        for (const element of Array.from(document.querySelectorAll("[cms-query]"))) {
            const query = parseQuery(element.getAttribute("cms-query") ?? "");
            if (query && "contractId" in query && !query.contractId.startsWith("kernel.")) {
                targets.add(`${query.contractId}/${query.capabilityId}`);
            }
        }
    }
    return targets;
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
            const local = blocs.get(id);
            if (local) {
                pending.push(local);
            }
        }
    }
    return result;
}
