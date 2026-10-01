import type { NavigationItem } from "../domain/types";

export function listAt(items: NavigationItem[], parentPath: number[]): NavigationItem[] | null {
    let list = items;
    for (const index of parentPath) {
        const parent = list[index];
        if (!parent) {
            return null;
        }
        parent.children ??= [];
        list = parent.children;
    }
    return list;
}

export function itemAt(items: NavigationItem[], path: number[]): NavigationItem | null {
    return listAt(items, path.slice(0, -1))?.[path.at(-1)!] ?? null;
}

export function moveItem(items: NavigationItem[], path: number[], direction: string): boolean {
    const siblings = listAt(items, path.slice(0, -1));
    const index = path.at(-1)!;
    const item = siblings?.[index];
    if (!siblings || !item) {
        return false;
    }
    if (direction === "up" || direction === "down") {
        const next = index + (direction === "up" ? -1 : 1);
        if (next < 0 || next >= siblings.length) {
            return false;
        }
        [siblings[index], siblings[next]] = [siblings[next]!, siblings[index]!];
        return true;
    }
    if (direction === "indent" && index > 0 && path.length + treeDepth(item) <= 3) {
        const previous = siblings[index - 1]!;
        if (path.length === 2 && previous.childPlacement === "lateral") {
            return false;
        }
        siblings.splice(index, 1);
        previous.children ??= [];
        previous.childPlacement ??= path.length === 1 ? "lateral" : "tabs";
        previous.children.push(item);
        return true;
    }
    if (direction === "outdent" && path.length > 1) {
        const outer = listAt(items, path.slice(0, -2));
        const parentIndex = path.at(-2)!;
        if (!outer || !outer[parentIndex]) {
            return false;
        }
        siblings.splice(index, 1);
        outer.splice(parentIndex + 1, 0, item);
        cleanEmptyParent(outer[parentIndex]!);
        return true;
    }
    return false;
}

export function reorderItem(
    items: NavigationItem[],
    sourcePath: number[],
    targetPath: number[],
    afterTarget: boolean,
): boolean {
    const sourceParent = sourcePath.slice(0, -1);
    const targetParent = targetPath.slice(0, -1);
    if (sourceParent.join(".") !== targetParent.join(".")) {
        return false;
    }
    const siblings = listAt(items, sourceParent);
    const sourceIndex = sourcePath.at(-1)!;
    const targetIndex = targetPath.at(-1)!;
    const item = siblings?.[sourceIndex];
    if (!siblings || !item || sourceIndex === targetIndex) {
        return false;
    }
    siblings.splice(sourceIndex, 1);
    const adjustedTarget = targetIndex - (sourceIndex < targetIndex ? 1 : 0);
    siblings.splice(adjustedTarget + (afterTarget ? 1 : 0), 0, item);
    return true;
}

export type DropPosition = "before" | "inside" | "after";

export function canRelocateItem(
    items: NavigationItem[],
    sourcePath: number[],
    targetPath: number[],
    position: DropPosition,
): boolean {
    const source = itemAt(items, sourcePath);
    const target = itemAt(items, targetPath);
    if (!source || !target || source === target || containsItem(source, target)) {
        return false;
    }
    const destinationDepth = targetPath.length + (position === "inside" ? 1 : 0);
    if (destinationDepth + treeDepth(source) - 1 > 3) {
        return false;
    }
    if (position === "inside" && !canContainChildren(items, targetPath)) {
        return false;
    }
    const root = position === "inside" ? target : itemAt(items, targetPath.slice(0, 1));
    return destinationDepth !== 2 || root?.childPlacement !== "tabs" || !source.children?.length;
}

export function relocateItem(
    items: NavigationItem[],
    sourcePath: number[],
    targetPath: number[],
    position: DropPosition,
): boolean {
    if (!canRelocateItem(items, sourcePath, targetPath, position)) {
        return false;
    }
    const source = itemAt(items, sourcePath)!;
    const target = itemAt(items, targetPath)!;
    const sourceParent = sourcePath.length > 1 ? itemAt(items, sourcePath.slice(0, -1)) : null;
    listAt(items, sourcePath.slice(0, -1))!.splice(sourcePath.at(-1)!, 1);
    if (sourceParent) {
        cleanEmptyParent(sourceParent);
    }
    const currentTargetPath = pathOf(items, target);
    if (!currentTargetPath) {
        return false;
    }
    if (position === "inside") {
        target.children ??= [];
        target.childPlacement ??= currentTargetPath.length === 1 ? "lateral" : "tabs";
        normalizeNestedPlacement(source, currentTargetPath.length + 1, target.childPlacement);
        target.children.push(source);
        return true;
    }
    const siblings = listAt(items, currentTargetPath.slice(0, -1))!;
    const targetIndex = currentTargetPath.at(-1)!;
    normalizeNestedPlacement(
        source,
        currentTargetPath.length,
        currentTargetPath.length === 2 ? items[currentTargetPath[0]!]!.childPlacement : undefined,
    );
    siblings.splice(targetIndex + (position === "after" ? 1 : 0), 0, source);
    return true;
}

export function navigationError(items: NavigationItem[]): string {
    return validateItems(items, new Set<string>(), 1);
}

function validateItems(items: NavigationItem[], used: Set<string>, depth: number): string {
    for (const item of items) {
        if (!item.use && !item.children?.length) {
            return `Add a child to “${item.label}” or turn it into a view.`;
        }
        if (item.use && used.has(item.use)) {
            return `The view used by “${item.label}” is already in this navigation.`;
        }
        if (item.use) {
            used.add(item.use);
        }
        if (item.children?.length) {
            if (depth >= 3) {
                return `“${item.label}” exceeds the three navigation levels.`;
            }
            if (depth === 1 && item.childPlacement !== "lateral" && item.childPlacement !== "tabs") {
                return `Choose how children of “${item.label}” should appear.`;
            }
            if (depth === 2 && item.childPlacement !== "tabs") {
                return `Children of “${item.label}” must be tabs.`;
            }
            const nested = validateItems(item.children, used, depth + 1);
            if (nested) {
                return nested;
            }
        }
    }
    return "";
}

function cleanEmptyParent(item: NavigationItem): void {
    if (!item.children?.length) {
        delete item.children;
        delete item.childPlacement;
    }
}

function canContainChildren(items: NavigationItem[], path: number[]): boolean {
    if (path.length === 1) {
        return true;
    }
    return path.length === 2 && items[path[0]!]?.childPlacement !== "tabs";
}

function containsItem(parent: NavigationItem, candidate: NavigationItem): boolean {
    return Boolean(parent.children?.some((child) => child === candidate || containsItem(child, candidate)));
}

function pathOf(items: NavigationItem[], target: NavigationItem, parentPath: number[] = []): number[] | null {
    for (const [index, item] of items.entries()) {
        const path = [...parentPath, index];
        if (item === target) {
            return path;
        }
        const nested = pathOf(item.children ?? [], target, path);
        if (nested) {
            return nested;
        }
    }
    return null;
}

function normalizeNestedPlacement(item: NavigationItem, depth: number, parentPlacement?: string): void {
    if (depth === 2 && item.children?.length && parentPlacement !== "tabs") {
        item.childPlacement = "tabs";
    }
}

function treeDepth(item: NavigationItem): number {
    return 1 + Math.max(0, ...(item.children ?? []).map(treeDepth));
}
