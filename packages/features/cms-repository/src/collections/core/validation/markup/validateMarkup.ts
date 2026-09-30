import type { CollectionBloc } from "cms-repository/collections/interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { CollectionLimits } from "../../limits";
import { validateDeclarative, validateHost, validateNoBindings, validateShadow } from "./shell";
import { type BlocMarkup, pageSlots, validatePageSlots, validateSlotTargets } from "./slots";
import { elements, type MarkupTree, markupTree, offeredSlots, significantRoots } from "./tree";

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
export function validateMarkup(blocs: readonly CollectionBloc[], limits: Readonly<CollectionLimits>): void {
    const byId = new Map(blocs.map((bloc) => [bloc.id, bloc]));
    const ids = new Set(byId.keys());
    const markup = new Map(blocs.map((bloc) => [bloc.id, inspect(bloc)]));
    for (const bloc of blocs) {
        const path = `$.blocs[${bloc.id}]`;
        const content = markup.get(bloc.id)!;
        if (content.shellSlots.size > limits.maxSlots || content.pageSlots.size > limits.maxSlots) {
            invalid(`markup must offer at most ${limits.maxSlots} slots`, `${path}.slots`);
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
            validateHost(content.light, bloc, `${path}.lightdom`);
            validatePlacedBlocs(content.light, bloc, ids, `${path}.lightdom`);
            validateSlotTargets(content.light, content.shellSlots, byId, markup, `${path}.lightdom`);
        }
        if (content.initial) {
            validateDeclarative(content.initial, `${path}.defaultContent`);
            validateNoBindings(content.initial, `${path}.defaultContent`);
            if (elements(content.initial).some((node) => node.name === "cms-host")) {
                invalid("cms-host is only supported in component lightdom", `${path}.defaultContent`);
            }
            validatePlacedBlocs(content.initial, bloc, ids, `${path}.defaultContent`);
            validateSlotTargets(content.initial, content.pageSlots, byId, markup, `${path}.defaultContent`);
        }
    }
}
