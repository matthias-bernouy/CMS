import { ordinal } from "../../../core/values";
import { parseHTML } from "linkedom";
import { satisfiesVersionRange } from "cms-repository/exports/contracts/compatibility";
import type { CollectionRelease, CollectionCapabilityRequirement } from "../../../interfaces/CollectionRelease";
import type { CollectionBloc } from "../../../interfaces/CollectionBloc";
import type { InitializationPage, InitializationOptions } from "../interfaces";
import { invalid } from "../../../core/errors";
import { collectionExampleDocument } from "../../../core/validation/examples/document";

/** Only resources copied by the recipe contribute live execution requirements. */
export function initializationRequirements(
    pages: readonly InitializationPage[],
    recipes: readonly CollectionCapabilityRequirement[],
    releases: readonly CollectionRelease[],
    selected: InitializationOptions["selected"],
) {
    const requirements = [...recipes];
    const blocs = new Map(releases.flatMap((release) => release.blocs.map((bloc) => [bloc.id, bloc] as const)));
    const used = new Set<string>();
    const visit = (bloc: CollectionBloc) => {
        if (used.has(bloc.id)) {
            return;
        }
        used.add(bloc.id);
        requirements.push(...bloc.requires);
        for (const id of bloc.uses) {
            const dependency = blocs.get(id);
            if (!dependency) {
                invalid(`missing used Bloc ${id}`, "$.pages");
            }
            visit(dependency);
        }
    };
    for (const page of pages) {
        const release = releases.find(({ collectionId }) => collectionId === page.owner.collectionId)!;
        const example = release.examples!.find(({ id }) => id === page.exampleId)!;
        requirements.push(...example.requires);
        const { document } = parseHTML(
            `<body>${collectionExampleDocument(release, page.exampleId, releases).html}</body>`,
        );
        for (const node of document.querySelectorAll("[cms-bloc]")) {
            const bloc = blocs.get(node.getAttribute("cms-bloc")!);
            if (!bloc) {
                invalid("unknown Page Bloc", "$.pages");
            }
            visit(bloc);
        }
    }
    const unique = [
        ...new Map(requirements.map((requirement) => [JSON.stringify(requirement), requirement])).values(),
    ].sort((a, b) => ordinal(JSON.stringify(a), JSON.stringify(b)));
    const contracts = [];
    for (const contractId of [...new Set(unique.map((requirement) => requirement.contractId))].sort()) {
        const contract = selected.find(({ release }) => release.contractId === contractId);
        const matching = unique.filter((requirement) => requirement.contractId === contractId);
        if (
            !contract ||
            !matching.every(
                (requirement) =>
                    satisfiesVersionRange(contract.release.version, requirement.versionRange) &&
                    contract.capabilities.some(({ definition }) => definition.id === requirement.capabilityId),
            )
        ) {
            invalid(`selected execution does not satisfy bootstrap requirements for ${contractId}`, "$.requirements");
        }
        contracts.push({ contractId, version: contract.release.version, digest: contract.digest });
    }
    return { requirements: unique, contracts };
}
