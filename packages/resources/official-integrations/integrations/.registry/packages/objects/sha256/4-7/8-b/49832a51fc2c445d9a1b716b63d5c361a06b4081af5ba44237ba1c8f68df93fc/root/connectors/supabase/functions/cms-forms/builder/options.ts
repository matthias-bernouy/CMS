import { HttpError, isRecord } from "../http.ts";
import { optionalText, recordArray, requiredText } from "./model.ts";

export function normalizedOptions(value: unknown, imagesRequired: boolean): Record<string, unknown>[] {
    const keys = new Set<string>();
    const options = recordArray(value).map((option) => {
        const key = optionKey(option, true);
        if (keys.has(key)) {
            throw new HttpError(422, `option key "${key}" is duplicated`);
        }
        keys.add(key);
        const image = normalizedImage(option, imagesRequired);
        return {
            key,
            label: requiredText(option.label, "option label", 160),
            ...image,
        };
    });
    if (options.length === 0) {
        throw new HttpError(422, "a choice question needs at least one option");
    }
    return options;
}

export function optionItems(value: unknown): Record<string, unknown>[] {
    if (!Array.isArray(value)) {
        return [];
    }
    return value.filter(isRecord).map((option, index) => {
        const key = optionKey(option, false) || `option-${index + 1}`;
        const legacyUrl = normalizedImageUrl(option.imageUrl, false);
        const legacyAlt = optionalText(option.imageAlt, 240);
        const image = isRecord(option.image)
            ? option.image
            : legacyUrl
              ? { url: legacyUrl, ...(legacyAlt ? { alt: legacyAlt } : {}) }
              : undefined;
        return { ...option, ...(image ? { image } : {}), key, id: key, position: index };
    });
}

export function optionKey(option: Record<string, unknown>, required: boolean): string {
    const key = String(option.key ?? option.value ?? "").trim();
    if (!key && !required) {
        return "";
    }
    if (!key || key.length > 80 || !/^[a-z][A-Za-z0-9_-]*$/.test(key)) {
        throw new HttpError(422, "option keys must start with a letter and use only letters, numbers, _ or -");
    }
    return key;
}

export function normalizedQuestionKey(value: unknown): string {
    const key = requiredText(value, "question key", 80);
    if (!/^[a-z][A-Za-z0-9_]*$/.test(key)) {
        throw new HttpError(422, "question keys must start with a lowercase letter and use letters, numbers or _");
    }
    return key;
}

function normalizedImageUrl(value: unknown, required: boolean): string | undefined {
    const imageUrl = optionalText(value, 2048);
    if (!imageUrl) {
        if (required) {
            throw new HttpError(422, "every image choice needs an image");
        }
        return undefined;
    }
    if (imageUrl.startsWith("/") && !imageUrl.startsWith("//")) {
        return imageUrl;
    }
    try {
        if (new URL(imageUrl).protocol === "https:") {
            return imageUrl;
        }
    } catch {
        // Report the same bounded validation error below.
    }
    throw new HttpError(422, "image URLs must use HTTPS or a CMS-relative /path");
}

function normalizedImage(option: Record<string, unknown>, required: boolean): Record<string, unknown> {
    const value = isRecord(option.image) ? option.image : {};
    const rawId = value.mediaId ?? value.id;
    const mediaId = String(rawId ?? "").trim();
    const alt = optionalText(value.alt ?? option.imageAlt, 240);
    if (/^[1-9][0-9]{0,18}$/.test(mediaId)) {
        return { image: { mediaId, ...(alt ? { alt } : {}) } };
    }
    const imageUrl = normalizedImageUrl(value.url ?? option.imageUrl, required);
    return imageUrl ? { imageUrl, ...(alt ? { imageAlt: alt } : {}) } : {};
}
