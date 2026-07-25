import { SOURCE_IMAGE_WIDTHS } from "../../interfaces/recipe";

export type ResponsiveSourceImageInput = Readonly<{
    baseUrl: string;
    sourceWidth: number;
    sourceHeight: number;
    loading: "lazy" | "eager";
    authoredSizes?: string;
    /** Only an explicit public classification joins the public rollout cohort. */
    access?: "public" | "private";
}>;

export type ResponsiveSourceImageAttributes = Readonly<{
    src: string;
    srcset?: string;
    sizes: string;
    width: number;
    height: number;
}>;

type OwnedAttribute = { generated: string; previous: string | null };
const generatedByImage = new WeakMap<HTMLImageElement, Map<string, OwnedAttribute>>();

export function buildResponsiveSourceImageAttributes(
    input: ResponsiveSourceImageInput,
): ResponsiveSourceImageAttributes | null {
    if (
        !isResolvedUrl(input.baseUrl) ||
        !isDimension(input.sourceWidth) ||
        !isDimension(input.sourceHeight) ||
        hasUnresolvedBinding(input.authoredSizes)
    ) {
        return null;
    }
    const src = sourceImageOriginalUrl(input.baseUrl);
    const candidates = SOURCE_IMAGE_WIDTHS.filter((width) => width <= input.sourceWidth);
    const srcset = candidates.map((width) => `${withCmsWidth(src, width)} ${width}w`).join(", ");
    return {
        src,
        ...(srcset ? { srcset } : {}),
        sizes: resolvedSizes(input),
        width: input.sourceWidth,
        height: input.sourceHeight,
    };
}

/** Applies network-sensitive attributes last. This avoids an eager original
 * fetch while the responsive descriptors are still incomplete. */
export function applyResponsiveSourceImageAttributes(
    image: HTMLImageElement,
    input: ResponsiveSourceImageInput,
): boolean {
    clearResponsiveSourceImageAttributes(image);
    const attributes = buildResponsiveSourceImageAttributes(input);
    if (!attributes) {
        scrubUnresolvedNetworkAttributes(image);
        return false;
    }
    const owned = new Map<string, OwnedAttribute>();
    setOwned(image, owned, "width", String(attributes.width));
    setOwned(image, owned, "height", String(attributes.height));
    setOwned(image, owned, "sizes", attributes.sizes);
    if (attributes.srcset) {
        setOwned(image, owned, "srcset", attributes.srcset);
    }
    setOwned(image, owned, "src", attributes.src);
    if (owned.size > 0) {
        generatedByImage.set(image, owned);
    }
    return true;
}

/** Removes only values this helper still owns. An authored or subsequently
 * changed attribute is never erased. */
export function clearResponsiveSourceImageAttributes(image: HTMLImageElement): void {
    const owned = generatedByImage.get(image);
    if (!owned) {
        return;
    }
    for (const [name, state] of owned) {
        if (image.getAttribute(name) !== state.generated) {
            continue;
        }
        if (safeToRestore(name, state.previous)) {
            image.setAttribute(name, state.previous!);
        } else {
            image.removeAttribute(name);
        }
    }
    generatedByImage.delete(image);
}

function setOwned(image: HTMLImageElement, owned: Map<string, OwnedAttribute>, name: string, value: string): void {
    const previous = image.getAttribute(name);
    if (previous === value) {
        return;
    }
    image.setAttribute(name, value);
    owned.set(name, { generated: value, previous });
}

function resolvedSizes(input: ResponsiveSourceImageInput): string {
    if (input.authoredSizes?.trim()) {
        return input.authoredSizes;
    }
    return input.loading === "lazy" ? "auto, 100vw" : "100vw";
}

function isResolvedUrl(value: string): boolean {
    return value.trim().length > 0 && !value.includes("{{");
}

function isDimension(value: number): boolean {
    return Number.isSafeInteger(value) && value > 0;
}

function withCmsWidth(baseUrl: string, width: number): string {
    const { path, query, hash } = splitUrl(baseUrl);
    removeCmsWidth(query);
    query.append("cms-width", String(width));
    return `${path}?${query.toString()}${hash}`;
}

export function sourceImageOriginalUrl(baseUrl: string): string {
    const { path, query, hash, hadQuery } = splitUrl(baseUrl);
    removeCmsWidth(query);
    const serialized = query.toString();
    return `${path}${serialized ? `?${serialized}` : hadQuery ? "?" : ""}${hash}`;
}

function splitUrl(value: string): { path: string; query: URLSearchParams; hash: string; hadQuery: boolean } {
    const hashIndex = value.indexOf("#");
    const beforeHash = hashIndex >= 0 ? value.slice(0, hashIndex) : value;
    const hash = hashIndex >= 0 ? value.slice(hashIndex) : "";
    const queryIndex = beforeHash.indexOf("?");
    return {
        path: queryIndex >= 0 ? beforeHash.slice(0, queryIndex) : beforeHash,
        query: new URLSearchParams(queryIndex >= 0 ? beforeHash.slice(queryIndex + 1) : ""),
        hash,
        hadQuery: queryIndex >= 0,
    };
}

function removeCmsWidth(query: URLSearchParams): void {
    for (const name of [...query.keys()]) {
        if (name.trim().toLowerCase() === "cms-width") {
            query.delete(name);
        }
    }
}

function hasUnresolvedBinding(value: string | undefined): boolean {
    return value?.includes("{{") ?? false;
}

function scrubUnresolvedNetworkAttributes(image: HTMLImageElement): void {
    for (const name of ["src", "srcset"] as const) {
        const value = image.getAttribute(name);
        if (value !== null && (!value.trim() || value.includes("{{"))) {
            image.removeAttribute(name);
        }
    }
}

function safeToRestore(name: string, value: string | null): boolean {
    if (value === null) {
        return false;
    }
    return name !== "src" && name !== "srcset" ? true : isResolvedUrl(value);
}
