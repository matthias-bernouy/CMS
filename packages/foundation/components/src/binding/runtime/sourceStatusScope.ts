import { SOURCE_ATTR, SOURCE_ID_ATTR } from "../core/attrs";
import { type SourceStatusValue } from "../source/presentation/sourceStatus";

export function sourceStatusScope(
    root: Element,
    statusesBySource: Map<Element, SourceStatusValue>,
    source: Element,
    current: SourceStatusValue,
): Record<string, SourceStatusValue> {
    const statuses: Record<string, SourceStatusValue> = {};

    for (const element of sourcePath(root, source)) {
        if (!element.hasAttribute(SOURCE_ATTR)) {
            continue;
        }
        const id = element.getAttribute(SOURCE_ID_ATTR)?.trim();
        if (!id) {
            continue;
        }
        const status = element === source ? current : statusesBySource.get(element);
        if (status) {
            statuses[id] = status;
        }
    }

    return statuses;
}

function sourcePath(root: Element, source: Element): Element[] {
    const path: Element[] = [];
    for (
        let element: Element | null = source;
        element && element !== root.parentElement;
        element = element.parentElement
    ) {
        path.push(element);
        if (element === root) {
            break;
        }
    }
    return path.reverse();
}
