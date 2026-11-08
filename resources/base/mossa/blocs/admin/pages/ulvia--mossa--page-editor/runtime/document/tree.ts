export type EditableInsertionTarget = Readonly<{
    parent: HTMLElement | null;
    slot: string;
}>;

export type EditablePageNode = Readonly<{
    element: HTMLElement;
    parent: HTMLElement | null;
    slot: string;
    depth: number;
    siblingIndex: number;
}>;

export function blocChildren(root: DocumentFragment, parent: HTMLElement | null, slot?: string): HTMLElement[] {
    const candidates = parent
        ? Array.from(parent.querySelectorAll<HTMLElement>("[cms-bloc]")).filter(
              (element) => element.parentElement?.closest<HTMLElement>("[cms-bloc]") === parent,
          )
        : Array.from(root.children).filter(
              (element): element is HTMLElement => element instanceof HTMLElement && element.hasAttribute("cms-bloc"),
          );
    return slot === undefined
        ? candidates
        : candidates.filter((element) => (element.getAttribute("slot") ?? "") === slot);
}

export function blocNodes(root: DocumentFragment): EditablePageNode[] {
    const nodes: EditablePageNode[] = [];
    const visit = (parent: HTMLElement | null, depth: number): void => {
        for (const [siblingIndex, element] of blocChildren(root, parent).entries()) {
            nodes.push({ element, parent, slot: element.getAttribute("slot") ?? "", depth, siblingIndex });
            visit(element, depth + 1);
        }
    };
    visit(null, 0);
    return nodes;
}

export function addressOf(root: DocumentFragment, element: HTMLElement | null): number[] | null {
    if (!element) {
        return null;
    }
    const address: number[] = [];
    let current: HTMLElement | null = element;
    while (current) {
        const parent = parentBloc(current);
        const index = blocChildren(root, parent).indexOf(current);
        if (index < 0) {
            return null;
        }
        address.unshift(index);
        current = parent;
    }
    return address;
}

export function elementAt(root: DocumentFragment, address: readonly number[] | null): HTMLElement | null {
    if (!address) {
        return null;
    }
    let parent: HTMLElement | null = null;
    let element: HTMLElement | null = null;
    for (const index of address) {
        element = blocChildren(root, parent)[index] ?? null;
        if (!element) {
            return null;
        }
        parent = element;
    }
    return element;
}

export function parentBloc(element: HTMLElement): HTMLElement | null {
    return element.parentElement?.closest<HTMLElement>("[cms-bloc]") ?? null;
}

export function insertionTarget(element: HTMLElement): EditableInsertionTarget {
    return { parent: parentBloc(element), slot: element.getAttribute("slot") ?? "" };
}
