import { type Scope } from "../core/scope";

export interface LiveBindingSite {
    update(scope: Scope): void;
    unmount?(): void;
}

export class MountedRegion {
    constructor(
        private readonly start: Comment,
        private readonly end: Comment,
        private readonly sites: LiveBindingSite[],
    ) {}

    get startNode(): Comment {
        return this.start;
    }

    update(scope: Scope): void {
        for (const site of this.sites) {
            site.update(scope);
        }
    }

    unmount(): void {
        for (const site of this.sites) {
            site.unmount?.();
        }
        removeInclusive(this.start, this.end);
    }
}

export class MountedInPlaceRegion {
    constructor(private readonly sites: LiveBindingSite[]) {}

    update(scope: Scope): void {
        for (const site of this.sites) {
            site.update(scope);
        }
    }

    unmount(): void {
        for (const site of this.sites) {
            site.unmount?.();
        }
    }
}

export function clearBetween(start: Node, end: Node): void {
    let node = start.nextSibling;
    while (node && node !== end) {
        const next = node.nextSibling;
        node.parentNode?.removeChild(node);
        node = next;
    }
}

function removeInclusive(start: Node, end: Node): void {
    const parent = start.parentNode;
    if (!parent) {
        return;
    }

    let node: Node | null = start;
    while (node) {
        const next: Node | null = node === end ? null : node.nextSibling;
        parent.removeChild(node);
        node = next;
    }
}
