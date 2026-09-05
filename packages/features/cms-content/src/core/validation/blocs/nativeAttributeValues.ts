import { isSafeNavigationalUrl } from "cms-content/core/utils/safeUrl";

const DYNAMIC_TOKEN = /(?:\{\{|#\{|@\{)/;
const CONTROL_CHARACTER = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/;
const POSITIVE_INTEGER = /^[1-9]\d*$/;

const SAME_TAB_REL = new Set(["", "nofollow", "sponsored", "ugc"]);
const NEW_TAB_REL = new Set([
    "noopener noreferrer",
    "noopener noreferrer nofollow",
    "noopener noreferrer sponsored",
    "noopener noreferrer ugc",
]);

export function nativeAttributeValueIssue(tag: string, attribute: string, value: string): string | null {
    const normalizedTag = tag.toLowerCase();
    const normalizedAttribute = attribute.toLowerCase();
    if (DYNAMIC_TOKEN.test(value) || CONTROL_CHARACTER.test(value)) {
        return `attribute "${attribute}" must be a static value without control characters`;
    }
    if (normalizedAttribute === "slot") {
        return /^[a-z][a-z0-9]*(?:-[a-z0-9]+)*$/.test(value)
            ? null
            : "native slot placement must target a named custom-element slot";
    }

    if (normalizedAttribute === "aria-label") {
        return value.trim() ? null : `attribute "${attribute}" must not be empty`;
    }
    if (normalizedTag === "a" && normalizedAttribute === "href") {
        return isSafeNavigationalUrl(value) ? null : "native link destination uses a forbidden URL scheme";
    }
    if (normalizedTag === "a" && normalizedAttribute === "target") {
        return value === "_blank" ? null : 'native link target must be "_blank" or omitted';
    }
    if (normalizedTag === "a" && normalizedAttribute === "rel") {
        return SAME_TAB_REL.has(value) || NEW_TAB_REL.has(value) ? null : "native link relationship is not controlled";
    }
    if (normalizedTag === "button" && normalizedAttribute === "type") {
        return value === "button" || value === "submit" ? null : 'native button type must be "button" or "submit"';
    }
    if (normalizedTag === "button" && normalizedAttribute === "disabled") {
        return value === "" ? null : "native disabled is a boolean attribute";
    }
    if (normalizedTag === "form" && normalizedAttribute === "autocomplete") {
        return value === "on" || value === "off" ? null : 'native form autocomplete must be "on" or "off"';
    }
    if (normalizedTag === "img") {
        return imageAttributeIssue(normalizedAttribute, value);
    }
    if (normalizedTag === "svg") {
        return svgAttributeIssue(normalizedAttribute, value);
    }
    return null;
}

export function nativeAttributeSetIssue(tag: string, attributes: Readonly<Record<string, string>>): string | null {
    const normalizedAttributes = Object.fromEntries(
        Object.entries(attributes).map(([attribute, value]) => [attribute.toLowerCase(), value]),
    );
    for (const [attribute, value] of Object.entries(attributes)) {
        const issue = nativeAttributeValueIssue(tag, attribute, value);
        if (issue) {
            return issue;
        }
    }

    const normalizedTag = tag.toLowerCase();
    if (normalizedTag === "a") {
        const target = normalizedAttributes.target;
        const rel = normalizedAttributes.rel ?? "";
        if (target === "_blank" && !NEW_TAB_REL.has(rel)) {
            return 'native links opening a new tab require derived "noopener noreferrer" relationships';
        }
        if (target !== "_blank" && !SAME_TAB_REL.has(rel)) {
            return "same-tab native links cannot retain new-tab relationships";
        }
    }
    if (normalizedTag === "img") {
        const decorative = normalizedAttributes.role === "presentation";
        if (decorative && (normalizedAttributes["aria-hidden"] !== "true" || normalizedAttributes.alt !== "")) {
            return 'decorative native images require role="presentation", aria-hidden="true" and an empty alt';
        }
        if (!decorative && (!normalizedAttributes.alt?.trim() || normalizedAttributes["aria-hidden"] !== undefined)) {
            return "informative native images require non-empty alternative text";
        }
    }
    if (normalizedTag === "svg") {
        const informative = normalizedAttributes.role === "img";
        if (
            informative &&
            (!normalizedAttributes["aria-label"]?.trim() || normalizedAttributes["aria-hidden"] !== undefined)
        ) {
            return 'informative native SVGs require role="img" and a non-empty accessible label';
        }
        if (
            !informative &&
            (normalizedAttributes["aria-hidden"] !== "true" || normalizedAttributes["aria-label"] !== undefined)
        ) {
            return 'decorative native SVGs require aria-hidden="true" and no accessible label';
        }
    }
    return null;
}

function imageAttributeIssue(attribute: string, value: string): string | null {
    if (attribute === "src") {
        return isCmsMediaSource(value) ? null : "native image source must reference a CMS media item";
    }
    if (attribute === "role") {
        return value === "presentation" ? null : 'native image role must be "presentation" or omitted';
    }
    if (attribute === "aria-hidden") {
        return value === "true" ? null : 'native image aria-hidden must be "true" or omitted';
    }
    if (attribute === "loading") {
        return value === "lazy" || value === "eager" ? null : 'native image loading must be "lazy" or "eager"';
    }
    if (attribute === "fetchpriority") {
        return ["auto", "high", "low"].includes(value) ? null : "native image fetch priority is not controlled";
    }
    if (attribute === "decoding") {
        return ["auto", "async", "sync"].includes(value) ? null : "native image decoding is not controlled";
    }
    if (attribute === "width" || attribute === "height") {
        return POSITIVE_INTEGER.test(value) ? null : `native image ${attribute} must be a positive integer`;
    }
    return null;
}

function svgAttributeIssue(attribute: string, value: string): string | null {
    if (attribute === "role") {
        return value === "img" ? null : 'native SVG role must be "img" or omitted';
    }
    if (attribute === "aria-hidden") {
        return value === "true" ? null : 'native SVG aria-hidden must be "true" or omitted';
    }
    return null;
}

export function isCmsMediaSource(value: string): boolean {
    return (
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !/[\u0000-\u0020\u007F]/.test(value) &&
        /\/\.cms\/files\/by-id\/[^/?#]+(?:[?#].*)?$/.test(value)
    );
}
