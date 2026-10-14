import { parseQuery } from "@bernouy/cms-content/bindings";
import { validateDocumentBindings } from "@bernouy/cms-content/page-document";
import type { BindingQueryCapability } from "@bernouy/cms-content/page-document";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionCapabilityRequirement, CollectionRelease } from "../../../interfaces/CollectionRelease";
import { CollectionValidationError } from "../../errors";
import { parseHTML } from "linkedom";
import { mergeQueryCapabilities } from "./mergeCapabilities";

/** Each resource and its used blocs need joint witnesses; unrelated resources stay independent. */
export async function verifyCollectionRequirements(
    release: CollectionRelease,
    catalogue?: ReleaseCatalogue,
): Promise<void> {
    const blocs = new Map(release.blocs.map((bloc) => [bloc.id, bloc]));
    for (const bloc of release.blocs) {
        const used = usedBlocs(bloc, blocs);
        const closure = used.flatMap((item) => item.requires);
        const capabilities = await verifyRequirements(
            closure,
            queryTargets(used.map((item) => item.lightdom ?? "")),
            `$.blocs.${bloc.id}.requires`,
            "this bloc and its used blocs",
            catalogue,
        );
        validateBindings(bloc.lightdom ?? "", capabilities, `$.blocs.${bloc.id}.lightdom`);
    }
    for (const page of release.pages ?? []) {
        const used = page.uses.flatMap((id) => {
            const bloc = blocs.get(id);
            return bloc ? usedBlocs(bloc, blocs) : [];
        });
        const closure = [...page.requires, ...used.flatMap((item) => item.requires)];
        const capabilities = await verifyRequirements(
            closure,
            queryTargets([page.document.html, ...used.map((item) => item.lightdom ?? "")]),
            `$.pages.${page.id}.requires`,
            "this page and its used blocs",
            catalogue,
        );
        validateBindings(page.document.html, capabilities, `$.pages.${page.id}.document.html`);
    }
}

async function verifyRequirements(
    closure: readonly CollectionCapabilityRequirement[],
    queries: ReadonlySet<string>,
    path: string,
    owner: string,
    catalogue?: ReleaseCatalogue,
): Promise<readonly BindingQueryCapability[]> {
    const result: BindingQueryCapability[] = [];
    for (const contractId of new Set(closure.map((requirement) => requirement.contractId))) {
        const requirements = closure.filter((requirement) => requirement.contractId === contractId);
        const entries = catalogue ? await catalogue.list(contractId) : [];
        const witnesses = entries.filter((entry) => {
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
        if (witnesses.length === 0) {
            throw new CollectionValidationError(
                "resolution_failed",
                `no non-yanked ${contractId} release jointly satisfies ${owner}`,
                path,
            );
        }
        for (const target of queries) {
            if (!target.startsWith(`${contractId}/`)) {
                continue;
            }
            const capabilityId = target.slice(contractId.length + 1);
            result.push(
                mergeQueryCapabilities(
                    contractId,
                    capabilityId,
                    witnesses.map((entry) =>
                        entry.admission.release.capabilities.find((capability) => capability.id === capabilityId),
                    ),
                    path,
                ),
            );
        }
    }
    return result;
}

function validateBindings(html: string, capabilities: readonly BindingQueryCapability[], path: string): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    try {
        validateDocumentBindings(document, { capabilities, requireCapabilityResolution: true });
    } catch (error) {
        throw new CollectionValidationError(
            "invalid_collection",
            error instanceof Error ? error.message : "invalid typed query binding",
            path,
        );
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
