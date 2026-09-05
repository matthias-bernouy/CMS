import { isCmsMediaSource } from "cms-content/core/validation/blocs/nativeAttributeValues";

export function componentImageIssue(
    attributes: Readonly<Record<string, string>>,
    allowIncompleteMedia: boolean,
): string | null {
    const source = attributes.src;
    if (attributes.role !== undefined && attributes.role !== "presentation") {
        return 'native image role must be "presentation" or omitted';
    }
    if (attributes["aria-hidden"] !== undefined && attributes["aria-hidden"] !== "true") {
        return 'native image aria-hidden must be "true" or omitted';
    }
    if (!source) {
        if (!allowIncompleteMedia || attributes.alt === undefined) {
            return "native image source must reference CMS media or a typed CMS Source image";
        }
        return attributes.role !== "presentation" || (attributes["aria-hidden"] === "true" && attributes.alt === "")
            ? null
            : "decorative native images require an empty alt and aria-hidden";
    }
    if (!isCmsMediaSource(source) && !isTypedSourceMedia(source)) {
        return "native image source must reference CMS media or a typed CMS Source image";
    }
    const decorative = attributes.role === "presentation";
    if (decorative) {
        return attributes["aria-hidden"] === "true" && attributes.alt === ""
            ? null
            : "decorative native images require an empty alt and aria-hidden";
    }
    return attributes.alt?.trim() && attributes["aria-hidden"] === undefined
        ? null
        : "informative native images require non-empty alternative text";
}

export function accessibleSvgIssue(attributes: Readonly<Record<string, string>>): string | null {
    if (attributes.role !== undefined && attributes.role !== "img") {
        return 'native SVG role must be "img" or omitted';
    }
    if (attributes["aria-hidden"] !== undefined && attributes["aria-hidden"] !== "true") {
        return 'native SVG aria-hidden must be "true" or omitted';
    }
    const informative = attributes.role === "img";
    if (informative) {
        return attributes["aria-label"]?.trim() && attributes["aria-hidden"] === undefined
            ? null
            : "informative native SVGs require role=img and an accessible label";
    }
    return attributes["aria-hidden"] === "true" && attributes["aria-label"] === undefined
        ? null
        : "decorative native SVGs require aria-hidden=true";
}

function isTypedSourceMedia(value: string): boolean {
    return value.startsWith("/") && !value.startsWith("//") && /\/\.cms\/sources\/[^/?#]+\/[^/?#]+/.test(value);
}
