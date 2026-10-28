import { parseMutation, parseQuery } from "@bernouy/cms-content/bindings";
import { validateDocumentBindings } from "@bernouy/cms-content/page-document";
import type { BindingQueryCapability } from "@bernouy/cms-content/page-document";
import type { ReleaseCatalogue } from "cms-repository/exports/contracts/catalogue";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { CollectionCapabilityRequirement, CollectionRelease } from "../../../interfaces/CollectionRelease";
import { CollectionValidationError } from "../../errors";
import { parseHTML } from "linkedom";
import { mergeMutationCapabilities, mergeQueryCapabilities } from "./mergeCapabilities";
import { validateSynchronizedProducerSchemas } from "./syncProducers";

type BindingTarget = {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly effect: "query" | "command";
};

function blocMarkup(bloc: CollectionBloc): string {
    return bloc.markup;
}

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
            bindingTargets(used.map(blocMarkup)),
            `$.blocs.${bloc.id}.requires`,
            "this bloc and its used blocs",
            catalogue,
        );
        validateBindings(release, blocMarkup(bloc), capabilities, `$.blocs.${bloc.id}.markup`);
    }
    for (const example of release.examples ?? []) {
        const used = [
            ...new Set(
                Array.from(
                    parseHTML(`<body>${example.document.html}</body>`).document.querySelectorAll("[cms-bloc]"),
                    (node) => node.getAttribute("cms-bloc")!,
                ),
            ),
        ].flatMap((id) => {
            const bloc = blocs.get(id);
            return bloc ? usedBlocs(bloc, blocs) : [];
        });
        const closure = [...example.requires, ...used.flatMap((item) => item.requires)];
        const capabilities = await verifyRequirements(
            closure,
            bindingTargets([example.document.html, ...used.map(blocMarkup)]),
            `$.examples.${example.id}.requires`,
            "this example and its used blocs",
            catalogue,
        );
        validateBindings(release, example.document.html, capabilities, `$.examples.${example.id}.document.html`);
    }
}

async function verifyRequirements(
    closure: readonly CollectionCapabilityRequirement[],
    targets: readonly BindingTarget[],
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
                                (!targets.some(
                                    (target) =>
                                        target.contractId === contractId &&
                                        target.capabilityId === requirement.capabilityId,
                                ) ||
                                    (targets.some(
                                        (target) =>
                                            target.contractId === contractId &&
                                            target.capabilityId === requirement.capabilityId &&
                                            target.effect === capability.behavior.effect,
                                    ) &&
                                        capability.output.type !== "binary")),
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
        for (const target of targets) {
            if (target.contractId !== contractId) {
                continue;
            }
            result.push(
                (target.effect === "query" ? mergeQueryCapabilities : mergeMutationCapabilities)(
                    contractId,
                    target.capabilityId,
                    witnesses.map((entry) =>
                        entry.admission.release.capabilities.find(
                            (capability) => capability.id === target.capabilityId,
                        ),
                    ),
                    path,
                ),
            );
        }
    }
    return result;
}

function validateBindings(
    release: CollectionRelease,
    html: string,
    capabilities: readonly BindingQueryCapability[],
    path: string,
): void {
    const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
    document.body.innerHTML = html;
    try {
        validateDocumentBindings(document, { capabilities, requireCapabilityResolution: true });
        validateSynchronizedProducerSchemas(release, document, capabilities, path);
    } catch (error) {
        throw new CollectionValidationError(
            "invalid_collection",
            error instanceof Error ? error.message : "invalid typed query binding",
            path,
        );
    }
}

function bindingTargets(markups: readonly string[]): readonly BindingTarget[] {
    const targets = new Map<string, BindingTarget>();
    for (const html of markups) {
        const { document } = parseHTML("<!DOCTYPE html><html><head></head><body></body></html>");
        document.body.innerHTML = html;
        for (const element of Array.from(document.querySelectorAll("[cms-query]"))) {
            const query = parseQuery(element.getAttribute("cms-query") ?? "");
            if (query && "contractId" in query && !query.contractId.startsWith("kernel.")) {
                const target = {
                    contractId: query.contractId,
                    capabilityId: query.capabilityId,
                    effect: "query" as const,
                };
                targets.set(`${target.contractId}\0${target.capabilityId}`, target);
            }
        }
        for (const element of Array.from(document.querySelectorAll("form[cms-mutation]"))) {
            const mutation = parseMutation(element.getAttribute("cms-mutation") ?? "");
            if (mutation && !mutation.contractId.startsWith("kernel.")) {
                const target = {
                    contractId: mutation.contractId,
                    capabilityId: mutation.capabilityId,
                    effect: "command" as const,
                };
                targets.set(`${target.contractId}\0${target.capabilityId}`, target);
            }
        }
    }
    return [...targets.values()];
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
