import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { validateDeclarative, validateHost, validateNoBindings, validateShadow } from "./shell";
import { type BlocMarkup, pageSlots, validatePageSlots, validateSlotTargets } from "./slots";
import { elements, markupTree, offeredSlots, significantRoots } from "./tree";
import { validateManagedNativeDefinition } from "./managedNative";
import { validateBlocDocument, type BlocDocumentValidationResult } from "@bernouy/cms-content/page-document";
import { capabilityCallKey } from "../../parsing/requirements";

function inspect(bloc: CollectionBloc): BlocMarkup {
    const shadow = bloc.kind === "component" ? markupTree(bloc.shadowdom) : undefined;
    const light = bloc.lightdom === undefined ? undefined : markupTree(bloc.lightdom);
    return {
        shadow,
        light,
        initial: bloc.defaultContent === undefined ? undefined : markupTree(bloc.defaultContent),
        shellSlots: shadow ? offeredSlots(shadow) : new Set(),
        pageSlots: pageSlots(light, shadow),
    };
}

function validateDeclaredUses(tree: ReturnType<typeof markupTree>, bloc: CollectionBloc, path: string): void {
    for (const node of elements(tree)) {
        if (node.name.includes("-") && node.name !== "cms-host" && !bloc.uses.includes(node.name)) {
            invalid(`placed Bloc <${node.name}> must be declared in uses`, path);
        }
    }
}

/** Checks authored structure, not binding types, CSS validity, or executable safety. */
export function validateMarkup(
    blocs: readonly CollectionBloc[],
    limits: Readonly<CollectionLimits>,
    importedBlocs: ReadonlySet<string> = new Set(),
): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const ids = new Set([...byId.keys(), ...importedBlocs]);
    const markup = new Map(blocs.map((bloc) => [bloc.id, inspect(bloc)]));
    for (const bloc of blocs) {
        const path = `$.blocs[${bloc.id}]`;
        const content = markup.get(bloc.id)!;
        validateManagedNativeDefinition(bloc, content, path);
        if (content.shadow) {
            validateDeclarative(content.shadow, `${path}.shadowdom`, true);
        }
        if (content.light) {
            validateDeclarative(content.light, `${path}.lightdom`);
        }
        if (content.initial) {
            validateDeclarative(content.initial, `${path}.defaultContent`);
            validateNoBindings(content.initial, `${path}.defaultContent`);
        }
        let canonical: BlocDocumentValidationResult;
        try {
            canonical = validateBlocDocument(
                {
                    ...bloc,
                    ...(bloc.lightdom === undefined ? {} : { fixedContent: bloc.lightdom }),
                },
                blocs,
                [...importedBlocs].map((id) => ({ id })),
            );
        } catch (error) {
            invalid(error instanceof Error ? error.message : "invalid Bloc document", path);
        }
        if (content.shellSlots.size > limits.maxSlotsPerBloc || content.pageSlots.size > limits.maxSlotsPerBloc) {
            invalid(`markup must offer at most ${limits.maxSlotsPerBloc} slots`, `${path}.slots`);
        }
        validatePageSlots(bloc, content, path);
        if (content.shadow) {
            validateShadow(content.shadow, `${path}.shadowdom`);
            if (elements(content.shadow).some((node) => ids.has(node.name))) {
                invalid("nested blocs belong in lightdom, not static shadow shells", `${path}.shadowdom`);
            }
        }
        if (content.light) {
            if (bloc.kind === "component" && significantRoots(content.light).some((node) => node.type === "text")) {
                invalid("component lightdom needs element roots for slot projection", `${path}.lightdom`);
            }
            validateHost(content.light, bloc, `${path}.lightdom`);
            validateDeclaredUses(content.light, bloc, `${path}.lightdom`);
            validateSlotTargets(content.light, content.shellSlots, byId, markup, `${path}.lightdom`, importedBlocs);
            const calls = canonical!.sources.map(({ method, url }) => {
                const call = capabilityCallKey(url);
                if (!call || method !== "POST") {
                    return invalid("Bloc sources must use a canonical CMS capability with POST", `${path}.lightdom`);
                }
                return call;
            });
            const requirements = new Set(
                bloc.requires.map(({ contractId, capabilityId }) => `${contractId}/${capabilityId}`),
            );
            for (const call of calls) {
                if (!requirements.has(call)) {
                    invalid(`capability call ${call} must be declared in requires`, `${path}.requires`);
                }
            }
        }
        if (content.initial) {
            if (elements(content.initial).some((node) => node.name === "cms-host")) {
                invalid("cms-host is only supported in component lightdom", `${path}.defaultContent`);
            }
            validateDeclaredUses(content.initial, bloc, `${path}.defaultContent`);
            validateSlotTargets(
                content.initial,
                content.pageSlots,
                byId,
                markup,
                `${path}.defaultContent`,
                importedBlocs,
            );
        }
    }
}
