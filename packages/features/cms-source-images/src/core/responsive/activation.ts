import { sourceImageOriginalUrl } from "./attributes";
import { boundSourceUrl } from "./bindings";
import { boundElements, isImage } from "./dom";
import { clearResponsiveSourceImageElement, type ResponsiveSourceImageBrowserApi } from "./element";
import { BoundImageAttributeOwnership, scrubUnresolvedNetworkAttributes } from "./ownership";

const AUXILIARY_BINDINGS = [
    ["width", "data-cms-width"],
    ["height", "data-cms-height"],
    ["media", "data-cms-media"],
    ["sizes", "data-cms-sizes"],
    ["srcset", "data-cms-srcset"],
] as const;

const INERT_BINDINGS = [
    "data-cms-src",
    "data-src",
    "data-cms-srcset",
    "data-cms-sizes",
    "data-cms-media",
    "data-cms-width",
    "data-cms-height",
];

export class BoundImageGroupActivation {
    private readonly ownership = new BoundImageAttributeOwnership();
    private readonly groupElements = new WeakMap<Element, Set<Element>>();

    constructor(
        private readonly doc: Document,
        private readonly api: ResponsiveSourceImageBrowserApi,
    ) {}

    sync(group: Element): void {
        const previous = this.groupElements.get(group) ?? new Set<Element>();
        const current = new Set(boundElements(group));
        for (const element of previous) {
            if (!current.has(element)) {
                this.cleanupElement(element);
            }
        }
        this.groupElements.set(group, current);
        if ([...current].some(hasUnresolvedBinding)) {
            for (const element of current) {
                this.cleanupElement(element);
                scrubUnresolvedNetworkAttributes(element);
            }
            return;
        }

        const explicitCandidates = [...current].some((element) => element.hasAttribute("data-cms-srcset"));
        for (const element of current) {
            if (isImage(element) && (!isResponsiveSource(element, this.doc) || explicitCandidates)) {
                clearResponsiveSourceImageElement(element);
            }
        }
        this.reconcileAuxiliaryBindings(current);
        for (const element of current) {
            if (isImage(element)) {
                this.activateImageSource(element, explicitCandidates);
            } else {
                this.ownership.clear(element, "src");
            }
        }
    }

    forget(group: Element): void {
        for (const element of this.groupElements.get(group) ?? boundElements(group)) {
            this.cleanupElement(element);
        }
        this.groupElements.delete(group);
    }

    private cleanupElement(element: Element): void {
        this.ownership.clearAll(element);
        if (isImage(element)) {
            clearResponsiveSourceImageElement(element);
        }
    }

    private reconcileAuxiliaryBindings(elements: Set<Element>): void {
        for (const [activeName, inertName] of AUXILIARY_BINDINGS) {
            for (const element of elements) {
                const value = element.getAttribute(inertName);
                if (value === null) {
                    this.ownership.clear(element, activeName);
                } else {
                    this.ownership.apply(element, activeName, value);
                }
            }
        }
    }

    private activateImageSource(image: HTMLImageElement, explicitCandidates: boolean): void {
        const value = boundSourceUrl(image);
        if (!value) {
            this.ownership.clear(image, "src");
            clearResponsiveSourceImageElement(image);
            return;
        }
        if (!explicitCandidates && isSameOriginSourceUrl(value, this.doc)) {
            this.ownership.clear(image, "src");
            this.api.syncResponsiveSourceImageElement(image);
            return;
        }
        clearResponsiveSourceImageElement(image);
        this.ownership.apply(image, "src", boundImageOriginalUrl(value));
    }
}

function isResponsiveSource(image: HTMLImageElement, doc: Document): boolean {
    const value = boundSourceUrl(image);
    return value !== "" && isSameOriginSourceUrl(value, doc);
}

function hasUnresolvedBinding(element: Element): boolean {
    for (const name of INERT_BINDINGS) {
        const value = element.getAttribute(name);
        if (value !== null && (!value.trim() || value.includes("{{"))) {
            return true;
        }
    }
    return false;
}

function boundImageOriginalUrl(value: string): string {
    return sourceImageOriginalUrl(value).replace(/\?(?=#|$)/, "");
}

function isSameOriginSourceUrl(value: string, doc: Document): boolean {
    try {
        const base = new URL(doc.baseURI);
        const candidate = new URL(value, base);
        return candidate.origin === base.origin && candidate.pathname.includes("/.cms/sources/");
    } catch {
        return false;
    }
}
