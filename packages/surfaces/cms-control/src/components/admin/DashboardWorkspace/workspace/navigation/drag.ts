import { syncNavigationDepth } from "./view";

type DropPosition = "after" | "before" | "inside";

export function handleNavigationDragStart(root: ShadowRoot, event: DragEvent): void {
    const handle = eventPathElement(event, "[data-navigation-drag-handle]");
    const node = handle?.closest<HTMLElement>("[data-navigation-node]");
    if (!node) {
        return;
    }
    clearNavigationDragState(root);
    node.dataset.navigationDragging = "true";
    event.dataTransfer?.setData("text/plain", node.dataset.nodeId ?? "navigation-item");
    if (event.dataTransfer) {
        const row = node.querySelector<HTMLElement>(":scope > .dashboard-navigation-row")!;
        const rect = row.getBoundingClientRect();
        const offsetX = Math.max(0, Math.min(rect.width, event.clientX - rect.left));
        const offsetY = Math.max(0, Math.min(rect.height, event.clientY - rect.top));
        event.dataTransfer.setDragImage(row, offsetX, offsetY);
        event.dataTransfer.effectAllowed = "move";
    }
}

export function handleNavigationDragOver(root: ShadowRoot, event: DragEvent): void {
    const dragging = root.querySelector<HTMLElement>("[data-navigation-dragging]");
    const target = eventPathElement(event, "[data-navigation-node]");
    clearDropTargets(root);
    if (!dragging || !target || target === dragging || dragging.contains(target)) {
        return;
    }
    const position = pointerPosition(target, event.clientX, event.clientY);
    if (!canMove(dragging, target, position)) {
        return;
    }
    event.preventDefault();
    target.dataset.navigationDrop = position;
    if (event.dataTransfer) {
        event.dataTransfer.dropEffect = "move";
    }
}

export function handleNavigationDrop(root: ShadowRoot, event: DragEvent): void {
    const dragging = root.querySelector<HTMLElement>("[data-navigation-dragging]");
    const target = eventPathElement(event, "[data-navigation-drop]");
    const position = target?.dataset.navigationDrop as DropPosition | undefined;
    if (!dragging || !target || !position || !canMove(dragging, target, position)) {
        clearNavigationDragState(root);
        return;
    }
    event.preventDefault();
    const depth = destinationDepth(target, position);
    if (position === "inside") {
        target.querySelector<HTMLElement>(":scope > [data-navigation-children]")!.append(dragging);
    } else if (position === "after") {
        target.after(dragging);
    } else {
        target.before(dragging);
    }
    syncNavigationDepth(dragging, depth);
    clearNavigationDragState(root);
}

export function handleNavigationKeydown(root: ShadowRoot, event: KeyboardEvent): boolean {
    const handle = eventPathElement(event, "[data-navigation-drag-handle]");
    const node = handle?.closest<HTMLElement>("[data-navigation-node]");
    if (!node || !event.altKey || !["ArrowDown", "ArrowLeft", "ArrowRight", "ArrowUp"].includes(event.key)) {
        return false;
    }
    const moved = moveWithKeyboard(node, event.key);
    if (moved) {
        event.preventDefault();
        clearNavigationDragState(root);
    }
    return moved;
}

export function clearNavigationDragState(root: ShadowRoot): void {
    root.querySelectorAll<HTMLElement>("[data-navigation-dragging]").forEach((node) => {
        delete node.dataset.navigationDragging;
    });
    clearDropTargets(root);
}

function canMove(dragging: HTMLElement, target: HTMLElement, position: DropPosition): boolean {
    const depth = destinationDepth(target, position);
    return depth >= 1 && depth + treeHeight(dragging) - 1 <= 3;
}

function destinationDepth(target: HTMLElement, position: DropPosition): number {
    return Number(target.dataset.depth ?? "1") + (position === "inside" ? 1 : 0);
}

function pointerPosition(target: HTMLElement, clientX: number, clientY: number): DropPosition {
    const rect = target.querySelector<HTMLElement>(":scope > .dashboard-navigation-row")!.getBoundingClientRect();
    if (clientX >= rect.left + Math.min(64, rect.width * 0.2)) {
        return "inside";
    }
    return clientY < rect.top + rect.height / 2 ? "before" : "after";
}

function moveWithKeyboard(node: HTMLElement, key: string): boolean {
    if (key === "ArrowUp" && node.previousElementSibling) {
        node.parentElement?.insertBefore(node, node.previousElementSibling);
        return true;
    }
    if (key === "ArrowDown" && node.nextElementSibling) {
        node.parentElement?.insertBefore(node.nextElementSibling, node);
        return true;
    }
    if (key === "ArrowLeft") {
        const parentNode = node.parentElement?.closest<HTMLElement>("[data-navigation-node]");
        if (parentNode) {
            parentNode.after(node);
            syncNavigationDepth(node, Number(parentNode.dataset.depth ?? "1"));
            return true;
        }
    }
    if (key === "ArrowRight") {
        const previous = node.previousElementSibling as HTMLElement | null;
        if (previous && canMove(node, previous, "inside")) {
            previous.querySelector<HTMLElement>(":scope > [data-navigation-children]")!.append(node);
            syncNavigationDepth(node, Number(previous.dataset.depth ?? "1") + 1);
            return true;
        }
    }
    return false;
}

function treeHeight(node: HTMLElement): number {
    const children = directChildren(node);
    return 1 + Math.max(0, ...children.map(treeHeight));
}

function directChildren(node: HTMLElement): HTMLElement[] {
    const list = node.querySelector<HTMLElement>(":scope > [data-navigation-children]");
    return Array.from(list?.children ?? []).filter(
        (child): child is HTMLElement => child instanceof HTMLElement && child.matches("[data-navigation-node]"),
    );
}

function clearDropTargets(root: ShadowRoot): void {
    root.querySelectorAll<HTMLElement>("[data-navigation-drop]").forEach((node) => {
        delete node.dataset.navigationDrop;
    });
}

function eventPathElement(event: Event, selector: string): HTMLElement | null {
    return (
        event
            .composedPath()
            .find(
                (candidate): candidate is HTMLElement =>
                    candidate instanceof HTMLElement && candidate.matches(selector),
            ) ?? null
    );
}
