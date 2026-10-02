import type { CollectionBloc, CollectionComponent } from "../../../interfaces/CollectionBloc";
import { invalid } from "../../errors";
import type { BlocMarkup } from "./slots";
import { elements, isElement, type MarkupTree, significantRoots } from "./tree";

export function validateManagedNativeDefinition(bloc: CollectionBloc, markup: BlocMarkup, path: string): void {
    if (bloc.kind !== "component" || !bloc.nativeElement) {
        return;
    }
    const slots = markup.shadow ? elements(markup.shadow).filter((node) => node.name === "slot") : [];
    if (slots.length !== 1 || slots[0]!.attribs.name !== undefined) {
        invalid("managed native components require exactly one default shadow slot", `${path}.shadowdom`);
    }
    if (Object.keys(bloc.slots).length > 0) {
        invalid("managed native components cannot declare page slots", `${path}.slots`);
    }
    if (!markup.initial) {
        invalid("managed native components require defaultContent", `${path}.defaultContent`);
    }
    const roots = significantRoots(markup.initial);
    const accepted = new Set(bloc.nativeElement.accepts);
    if (
        roots.length !== 1 ||
        !isElement(roots[0]!) ||
        !accepted.has(roots[0]!.name as (typeof bloc.nativeElement.accepts)[number]) ||
        roots[0]!.attribs.slot !== undefined
    ) {
        invalid(
            `defaultContent must contain exactly one un-slotted accepted native root (${formatAccepted(bloc)})`,
            `${path}.defaultContent`,
        );
    }
}

export function validateManagedNativeHosts(
    tree: MarkupTree,
    blocs: ReadonlyMap<string, CollectionBloc>,
    path: string,
): void {
    for (const host of elements(tree)) {
        const target = blocs.get(host.name);
        if (target?.kind !== "component" || !target.nativeElement) {
            continue;
        }
        if (!hasOnlyManagedChild(host, target)) {
            invalid(
                `bloc ${target.id} requires exactly one direct, un-slotted accepted native child (${formatAccepted(target)})`,
                path,
            );
        }
    }
}

function hasOnlyManagedChild(host: ReturnType<typeof elements>[number], bloc: CollectionComponent): boolean {
    const children = host.children.filter(isElement);
    const siblingText = host.children.some((node) => node.type === "text" && node.data.trim().length > 0);
    return (
        children.length === 1 &&
        bloc.nativeElement?.accepts.includes(children[0]!.name as (typeof bloc.nativeElement.accepts)[number]) ===
            true &&
        children[0]!.attribs.slot === undefined &&
        !siblingText
    );
}

function formatAccepted(bloc: CollectionComponent): string {
    return bloc.nativeElement!.accepts.map((tag) => `<${tag}>`).join(", ");
}
