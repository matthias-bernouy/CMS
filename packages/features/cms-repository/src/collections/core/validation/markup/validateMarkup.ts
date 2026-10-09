import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { validateDeclarative, validateHost, validateNoBindings, validateShadow } from "./shell";
import { type BlocMarkup, pageSlots, validatePageSlots, validateSlotTargets } from "./slots";
import { elements, type MarkupTree, markupTree, offeredSlots, significantRoots } from "./tree";
import { validateManagedNativeDefinition, validateManagedNativeHosts } from "./managedNative";
import { validateDefaultSlotContracts, validateFixedLightDomSlotContracts } from "./slotContracts";
import { validateBlocLightHtml } from "../../parsing/pages/blocLightDocument";

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

function validatePlacedBlocs(tree: MarkupTree, bloc: CollectionBloc, ids: ReadonlySet<string>, path: string): void {
    for (const node of elements(tree)) {
        if (!node.name.includes("-") || node.name === "cms-host") {
            continue;
        }
        if (!ids.has(node.name)) {
            invalid(`unknown local bloc ${node.name}`, path);
        }
        if (!bloc.uses.includes(node.name)) {
            invalid(`placed bloc ${node.name} must be declared in uses`, path);
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
        if (content.shellSlots.size > limits.maxSlotsPerBloc || content.pageSlots.size > limits.maxSlotsPerBloc) {
            invalid(`markup must offer at most ${limits.maxSlotsPerBloc} slots`, `${path}.slots`);
        }
        validatePageSlots(bloc, content, path);
        if (content.shadow) {
            validateDeclarative(content.shadow, `${path}.shadowdom`, true);
            validateShadow(content.shadow, `${path}.shadowdom`);
            if (elements(content.shadow).some((node) => ids.has(node.name))) {
                invalid("nested blocs belong in lightdom, not static shadow shells", `${path}.shadowdom`);
            }
            validatePlacedBlocs(content.shadow, bloc, ids, `${path}.shadowdom`);
        }
        if (content.light) {
            if (bloc.kind === "component" && significantRoots(content.light).some((node) => node.type === "text")) {
                invalid("component lightdom needs element roots for slot projection", `${path}.lightdom`);
            }
            validateDeclarative(content.light, `${path}.lightdom`);
            validateManagedNativeHosts(content.light, byId, `${path}.lightdom`, { strictAttributes: false });
            validateHost(content.light, bloc, `${path}.lightdom`);
            validatePlacedBlocs(content.light, bloc, ids, `${path}.lightdom`);
            validateSlotTargets(content.light, content.shellSlots, byId, markup, `${path}.lightdom`, importedBlocs);
            validateFixedLightDomSlotContracts(content.light, byId, importedBlocs, `${path}.lightdom`);
            const calls = validateBlocLightHtml(bloc.lightdom!, `${path}.lightdom`);
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
            validateDeclarative(content.initial, `${path}.defaultContent`);
            validateManagedNativeHosts(content.initial, byId, `${path}.defaultContent`);
            validateNoBindings(content.initial, `${path}.defaultContent`);
            if (elements(content.initial).some((node) => node.name === "cms-host")) {
                invalid("cms-host is only supported in component lightdom", `${path}.defaultContent`);
            }
            validatePlacedBlocs(content.initial, bloc, ids, `${path}.defaultContent`);
            validateSlotTargets(
                content.initial,
                content.pageSlots,
                byId,
                markup,
                `${path}.defaultContent`,
                importedBlocs,
            );
            validateDefaultSlotContracts(content.initial, bloc, byId, importedBlocs, `${path}.defaultContent`);
        }
    }
}
