type FileImageReference = {
    readonly url?: string;
    readonly variants?: readonly {
        readonly profile?: string;
        readonly url?: string;
        readonly width?: number;
    }[];
};

/** Projects concrete FileReferences before serialization; unresolved binding expressions stay client-driven. */
export function projectKnownFileImages(document: Document): void {
    for (const host of document.querySelectorAll<HTMLElement>("ulvia-official-image[file]")) {
        const reference = parseReference(host.getAttribute("file"));
        const image = host.querySelector<HTMLImageElement>(":scope > img");
        if (!reference || !image || !reference.url) {
            continue;
        }
        const profile = host.getAttribute("profile") || "responsive";
        const variants = (reference.variants ?? [])
            .filter(
                (variant) =>
                    variant.url &&
                    Number.isSafeInteger(variant.width) &&
                    Number(variant.width) > 0 &&
                    (!variant.profile || variant.profile === profile),
            )
            .slice(0, 10);
        image.setAttribute("src", reference.url);
        image.setAttribute("sizes", host.getAttribute("sizes") || "100vw");
        const sourceSet = variants.map((variant) => `${variant.url} ${variant.width}w`).join(", ");
        if (sourceSet) {
            image.setAttribute("srcset", sourceSet);
        } else {
            image.removeAttribute("srcset");
        }
        const decorative = host.hasAttribute("decorative");
        image.setAttribute("alt", decorative ? "" : host.getAttribute("alt") || "");
        image.toggleAttribute("aria-hidden", decorative);
        if (decorative) {
            image.setAttribute("role", "presentation");
        } else {
            image.removeAttribute("role");
        }
        image.setAttribute("loading", host.getAttribute("loading") === "eager" ? "eager" : "lazy");
        image.setAttribute("fetchpriority", host.getAttribute("fetchpriority") === "high" ? "high" : "auto");
        image.setAttribute("decoding", "async");
    }
}

function parseReference(value: string | null): FileImageReference | null {
    if (!value || value.includes("{{")) {
        return null;
    }
    try {
        const parsed = JSON.parse(value) as FileImageReference;
        return parsed && typeof parsed === "object" ? parsed : null;
    } catch {
        return null;
    }
}
