import { normalizeInternalUrl } from "content/blocs/core/markup/security/safeUrl";

const VIDEO_BOOLEANS = new Set(["controls", "muted", "loop", "playsinline", "autoplay"]);
const TRACK_KINDS = new Set(["subtitles", "captions", "descriptions", "chapters", "metadata"]);

export function isNativeMediaUrlAttribute(tag: string, attribute: string): boolean {
    return (
        (tag === "video" && (attribute === "src" || attribute === "poster")) ||
        (["track", "source"].includes(tag) && attribute === "src")
    );
}

export function nativeMediaAttributeIssue(tag: string, attribute: string, value: string): string | null {
    if (isNativeMediaUrlAttribute(tag, attribute)) {
        return normalizeInternalUrl(value) !== null && isCmsMediaSource(value)
            ? null
            : `native ${tag} ${attribute} must reference a CMS file`;
    }
    if ((tag === "video" && VIDEO_BOOLEANS.has(attribute)) || (tag === "track" && attribute === "default")) {
        return value === "" ? null : `native ${attribute} is a boolean attribute`;
    }
    if (tag === "video" && attribute === "preload") {
        return ["none", "metadata", "auto"].includes(value)
            ? null
            : "native video preload must be none, metadata or auto";
    }
    if (tag === "video" && (attribute === "width" || attribute === "height")) {
        return /^[1-9]\d*$/u.test(value) ? null : `native video ${attribute} must be a positive integer`;
    }
    if (tag === "track" && attribute === "kind") {
        return TRACK_KINDS.has(value) ? null : "native track kind is not controlled";
    }
    if (tag === "track" && attribute === "srclang") {
        try {
            return Intl.getCanonicalLocales(value).length === 1 ? null : "native track srclang must be a language tag";
        } catch {
            return "native track srclang must be a language tag";
        }
    }
    if (tag === "track" && attribute === "label") {
        return value.trim() ? null : "native track label must not be empty";
    }
    return null;
}

export function nativeMediaAttributeSetIssue(attributes: Readonly<Record<string, string>>): string | null {
    if (!attributes.src?.trim()) {
        return "native tracks require a non-empty source";
    }
    return (attributes.kind ?? "subtitles") === "subtitles" && !attributes.srclang
        ? "native subtitle tracks require srclang"
        : null;
}

export function isCmsMediaSource(value: string): boolean {
    return (
        value.startsWith("/") &&
        !value.startsWith("//") &&
        !/[\u0000-\u0020\u007F]/.test(value) &&
        /\/\.cms\/call\/ulvia\/cms\.files\/files\/[^/?#]+\/[^/?#]+(?:\/representations\/(?:thumbnail|responsive)\/\d+\.webp)?(?:[?#].*)?$/.test(
            value,
        )
    );
}
