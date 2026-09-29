import { buildProviderImageAttributes, validDimension } from "./providerMediaAttributes";

type Owned = Map<string, { generated: string; previous: string | null }>;
const generated = new WeakMap<HTMLImageElement, Owned>();

/** Activates bound provider media only after the URL and dimensions resolve. */
export function syncProviderMediaImage(image: HTMLImageElement): void {
    const raw = image.getAttribute("data-cms-src")?.trim();
    if (raw === undefined) {
        clearGenerated(image);
        return;
    }
    const previous = generated.get(image);
    if (!raw || raw.includes("{{")) {
        clearGenerated(image, previous);
        scrubUnresolved(image);
        return;
    }
    const width = dimension(image.getAttribute("data-source-width") ?? image.getAttribute("data-cms-width"));
    const height = dimension(image.getAttribute("data-source-height") ?? image.getAttribute("data-cms-height"));
    const sizes = image.getAttribute("data-cms-sizes");
    if (sizes?.includes("{{")) {
        clearGenerated(image, previous);
        scrubUnresolved(image);
        return;
    }
    if (width === null && height === null) {
        clearGenerated(image, previous);
        setGenerated(image, "src", raw);
        return;
    }
    if (width === null || height === null || width === 0 || height === 0) {
        clearGenerated(image, previous);
        scrubUnresolved(image);
        return;
    }
    const attributes = buildProviderImageAttributes({
        url: raw,
        width,
        height,
        baseURI: image.ownerDocument.baseURI,
        ...(sizes ? { sizes } : {}),
        loading: image.getAttribute("loading") === "lazy" ? "lazy" : "eager",
    });
    if (!attributes) {
        clearGenerated(image, previous);
        setGenerated(image, "src", raw);
        return;
    }
    setGenerated(image, "width", String(attributes.width));
    setGenerated(image, "height", String(attributes.height));
    setGenerated(image, "sizes", attributes.sizes);
    if (attributes.srcset) {
        setGenerated(image, "srcset", attributes.srcset);
    } else {
        clearGeneratedAttribute(image, "srcset");
    }
    setGenerated(image, "src", attributes.src);
}

export function installProviderMediaImageRuntime(root: Document | Element): { disconnect(): void } {
    const doc = root.nodeType === 9 ? (root as Document) : root.ownerDocument;
    if (!doc) {
        throw new TypeError("provider image runtime requires a document");
    }
    const scan = (node: Node): void => {
        if (node.nodeType === 1 && (node as Element).matches("img[data-cms-src]")) {
            syncProviderMediaImage(node as HTMLImageElement);
        }
        if ("querySelectorAll" in node) {
            for (const image of (node as ParentNode).querySelectorAll<HTMLImageElement>("img[data-cms-src]")) {
                syncProviderMediaImage(image);
            }
        }
    };
    const Observer = doc.defaultView?.MutationObserver ?? MutationObserver;
    const observer = new Observer((records) => {
        for (const record of records) {
            if (record.type === "attributes") {
                if (record.target.nodeType === 1 && (record.target as Element).localName === "img") {
                    syncProviderMediaImage(record.target as HTMLImageElement);
                }
            } else {
                record.addedNodes.forEach(scan);
            }
        }
    });
    observer.observe(root, {
        attributes: true,
        attributeFilter: [
            "data-cms-src",
            "data-source-width",
            "data-source-height",
            "data-cms-width",
            "data-cms-height",
            "data-cms-sizes",
            "loading",
        ],
        childList: true,
        subtree: true,
    });
    scan(root);
    return { disconnect: () => observer.disconnect() };
}

function setGenerated(image: HTMLImageElement, name: string, value: string): void {
    const owned = generated.get(image) ?? new Map<string, { generated: string; previous: string | null }>();
    const current = image.getAttribute(name);
    const existing = owned.get(name);
    const previous = existing && current === existing.generated ? existing.previous : current;
    if (current !== value) {
        image.setAttribute(name, value);
    }
    owned.set(name, { generated: value, previous });
    generated.set(image, owned);
}

function clearGenerated(image: HTMLImageElement, owned = generated.get(image)): void {
    for (const name of owned?.keys() ?? []) {
        clearGeneratedAttribute(image, name);
    }
}

function clearGeneratedAttribute(image: HTMLImageElement, name: string): void {
    const owned = generated.get(image);
    const state = owned?.get(name);
    if (state && image.getAttribute(name) === state.generated) {
        if (state.previous !== null && !state.previous.includes("{{")) {
            image.setAttribute(name, state.previous);
        } else {
            image.removeAttribute(name);
        }
    }
    owned?.delete(name);
}

function scrubUnresolved(image: HTMLImageElement): void {
    for (const name of ["src", "srcset"]) {
        const value = image.getAttribute(name);
        if (value !== null && (!value.trim() || value.includes("{{"))) {
            image.removeAttribute(name);
        }
    }
}

function dimension(value: string | null): number | null {
    if (value === null) {
        return null;
    }
    if (!value.trim() || value.includes("{{")) {
        return 0;
    }
    const number = Number(value);
    return validDimension(number) ? number : 0;
}
