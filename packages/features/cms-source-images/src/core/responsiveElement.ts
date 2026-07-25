import {
    applyResponsiveSourceImageAttributes,
    buildResponsiveSourceImageAttributes,
    clearResponsiveSourceImageAttributes,
    sourceImageOriginalUrl,
    type ResponsiveSourceImageAttributes,
    type ResponsiveSourceImageInput,
} from "./responsive";

type ResponsiveElementState = {
    authoredSizes?: string;
    generatedSizes?: string;
    fallbackSrc?: string;
};

type DimensionBinding = { kind: "absent" | "blocked" } | { kind: "resolved"; value: number };
export type ResponsiveSourceImageRollout = Readonly<{
    public: boolean;
    private: boolean;
}>;

const states = new WeakMap<HTMLImageElement, ResponsiveElementState>();

/**
 * Activates an image whose Source URL and intrinsic dimensions are supplied by
 * client-side bindings. Only historical rows with both dimension attributes
 * absent, explicitly `null`, or both rendered as empty strings keep the
 * immutable original as a fallback. Partial, invalid, or unresolved template
 * dimensions stay network-dark.
 */
export function syncResponsiveSourceImageElement(image: HTMLImageElement, enabled = true): boolean {
    const state = states.get(image) ?? {};
    captureAuthoredSizes(image, state);

    const baseUrl = image.getAttribute("data-src")?.trim() ?? "";
    const sourceWidthValue = image.getAttribute("data-source-width");
    const sourceHeightValue = image.getAttribute("data-source-height");
    const emptyHistoricalPair = isEmptyBinding(sourceWidthValue) && isEmptyBinding(sourceHeightValue);
    const sourceWidth = emptyHistoricalPair ? { kind: "absent" as const } : dimensionBinding(sourceWidthValue);
    const sourceHeight = emptyHistoricalPair ? { kind: "absent" as const } : dimensionBinding(sourceHeightValue);
    if (
        !isResolved(baseUrl) ||
        hasUnresolvedBinding(state.authoredSizes) ||
        sourceWidth.kind === "blocked" ||
        sourceHeight.kind === "blocked" ||
        sourceWidth.kind !== sourceHeight.kind
    ) {
        removeOwnedFallback(image, state);
        clearResponsiveSourceImageAttributes(image);
        scrubUnresolvedNetworkAttributes(image);
        state.generatedSizes = undefined;
        states.set(image, state);
        return false;
    }

    if (!enabled || sourceWidth.kind === "absent") {
        clearResponsiveSourceImageAttributes(image);
        const originalUrl = sourceImageOriginalUrl(baseUrl);
        const currentSrc = image.getAttribute("src");
        const ownsCurrentFallback = state.fallbackSrc !== undefined && currentSrc === state.fallbackSrc;
        if (currentSrc === null || ownsCurrentFallback) {
            if (currentSrc !== originalUrl) {
                image.setAttribute("src", originalUrl);
            }
            state.fallbackSrc = originalUrl;
        } else {
            state.fallbackSrc = undefined;
        }
        state.generatedSizes = undefined;
        states.set(image, state);
        return false;
    }
    if (sourceWidth.kind !== "resolved" || sourceHeight.kind !== "resolved") {
        return false;
    }

    removeOwnedFallback(image, state);
    const loading = image.getAttribute("loading") === "lazy" ? "lazy" : "eager";
    const applied = applyResponsiveSourceImageAttributes(image, {
        baseUrl,
        sourceWidth: sourceWidth.value,
        sourceHeight: sourceHeight.value,
        loading,
        ...(state.authoredSizes ? { authoredSizes: state.authoredSizes } : {}),
    });
    state.generatedSizes = state.authoredSizes ?? (loading === "lazy" ? "auto, 100vw" : "100vw");
    state.fallbackSrc = undefined;
    states.set(image, state);
    return applied;
}

export function clearResponsiveSourceImageElement(image: HTMLImageElement): void {
    const state = states.get(image);
    clearResponsiveSourceImageAttributes(image);
    if (state) {
        removeOwnedFallback(image, state);
    }
    states.delete(image);
}

export type ResponsiveSourceImageBrowserApi = Readonly<{
    applyResponsiveSourceImageAttributes: (image: HTMLImageElement, input: ResponsiveSourceImageInput) => boolean;
    buildResponsiveSourceImageAttributes: (input: ResponsiveSourceImageInput) => ResponsiveSourceImageAttributes | null;
    clearResponsiveSourceImageAttributes: typeof clearResponsiveSourceImageAttributes;
    clearResponsiveSourceImageElement: typeof clearResponsiveSourceImageElement;
    syncResponsiveSourceImageElement: (image: HTMLImageElement) => boolean;
}>;

export function createResponsiveSourceImageBrowserApi(
    rollout: ResponsiveSourceImageRollout,
): ResponsiveSourceImageBrowserApi {
    return {
        applyResponsiveSourceImageAttributes: (image, input) =>
            rolloutEnabled(rollout, input.access ?? image.getAttribute("data-source-image-access"))
                ? applyResponsiveSourceImageAttributes(image, input)
                : applyOriginalSourceImageAttributes(image, input),
        buildResponsiveSourceImageAttributes: (input) =>
            rolloutEnabled(rollout, input.access) ? buildResponsiveSourceImageAttributes(input) : null,
        clearResponsiveSourceImageAttributes,
        clearResponsiveSourceImageElement,
        syncResponsiveSourceImageElement: (image) =>
            syncResponsiveSourceImageElement(
                image,
                rolloutEnabled(rollout, image.getAttribute("data-source-image-access")),
            ),
    };
}

function applyOriginalSourceImageAttributes(image: HTMLImageElement, input: ResponsiveSourceImageInput): boolean {
    clearResponsiveSourceImageAttributes(image);
    if (!isResolved(input.baseUrl) || hasUnresolvedBinding(input.authoredSizes)) {
        scrubUnresolvedNetworkAttributes(image);
        return false;
    }
    if (!image.hasAttribute("src")) {
        image.setAttribute("src", sourceImageOriginalUrl(input.baseUrl));
    }
    return false;
}

function captureAuthoredSizes(image: HTMLImageElement, state: ResponsiveElementState): void {
    const raw = image.getAttribute("sizes");
    const current = raw?.trim() ? raw : undefined;
    if (current !== state.generatedSizes) {
        state.authoredSizes = current;
    }
}

function removeOwnedFallback(image: HTMLImageElement, state: ResponsiveElementState): void {
    if (state.fallbackSrc && image.getAttribute("src") === state.fallbackSrc) {
        image.removeAttribute("src");
    }
    state.fallbackSrc = undefined;
}

function scrubUnresolvedNetworkAttributes(image: HTMLImageElement): void {
    for (const name of ["src", "srcset"] as const) {
        const value = image.getAttribute(name);
        if (value !== null && (!value.trim() || value.includes("{{"))) {
            image.removeAttribute(name);
        }
    }
}

function dimensionBinding(value: string | null): DimensionBinding {
    if (value === null) {
        return { kind: "absent" };
    }
    const normalized = value.trim();
    if (normalized.toLowerCase() === "null") {
        return { kind: "absent" };
    }
    if (!normalized || hasUnresolvedBinding(normalized)) {
        return { kind: "blocked" };
    }
    const parsed = Number(normalized);
    return Number.isSafeInteger(parsed) && parsed > 0 ? { kind: "resolved", value: parsed } : { kind: "blocked" };
}

function isEmptyBinding(value: string | null): boolean {
    return value !== null && value.trim().length === 0;
}

function rolloutEnabled(rollout: ResponsiveSourceImageRollout, access: string | null | undefined): boolean {
    return access?.trim().toLowerCase() === "public" ? rollout.public : rollout.private;
}

function isResolved(value: string): boolean {
    return value.length > 0 && !value.includes("{{");
}

function hasUnresolvedBinding(value: string | undefined): boolean {
    return value?.includes("{{") ?? false;
}
