/** Mounts source-independent `$range(n)` repeats owned by one binding root. */

import { REPEAT_ATTR, SOURCE_ATTR } from "../core/attrs";
import type { FilterMap } from "../core/interpolate";
import { CompiledTemplate } from "../reactive/CompiledTemplate";
import type { MountedRegion } from "../reactive/MountedRegion";
import { parseRepeat } from "../render/repeat";
import { eachMatching } from "./discovery";

type MountedFixedRange = {
    authored: Element;
    marker: Comment;
    region: MountedRegion;
};

export class FixedRangeRuntime {
    private readonly mounted = new Map<Element, MountedFixedRange>();

    constructor(
        private readonly root: Element,
        private readonly filters: FilterMap,
    ) {}

    mountWithin(node: Node): void {
        eachMatching(node, REPEAT_ATTR, this.root, (element) => this.mount(element));
    }

    restore(): void {
        for (const { authored, marker, region } of Array.from(this.mounted.values()).reverse()) {
            region.unmount();
            marker.replaceWith(authored);
        }
        this.mounted.clear();
    }

    private mount(element: Element): void {
        if (this.mounted.has(element) || !element.isConnected || !this.isStandaloneRange(element)) {
            return;
        }
        const parent = element.parentNode;
        if (!parent) {
            return;
        }

        const doc = element.ownerDocument ?? document;
        const fragment = doc.createDocumentFragment();
        fragment.appendChild(element.cloneNode(true));
        const template = CompiledTemplate.fromFragment(fragment, this.filters);
        const marker = doc.createComment("cms-fixed-range authored");
        const before = element.nextSibling;

        parent.insertBefore(marker, element);
        element.remove();
        const region = template.mount(parent, {}, before);
        this.mounted.set(element, { authored: element, marker, region });
    }

    private isStandaloneRange(element: Element): boolean {
        const spec = parseRepeat(element.getAttribute(REPEAT_ATTR) ?? "");
        if (!spec.path.startsWith("$range(")) {
            return false;
        }

        for (let parent = element.parentElement; parent && parent !== this.root; parent = parent.parentElement) {
            if (parent.hasAttribute(SOURCE_ATTR) || parent.hasAttribute(REPEAT_ATTR)) {
                return false;
            }
        }
        return true;
    }
}
