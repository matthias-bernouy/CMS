import { ContentValidationError } from "content/application/core/validation/errors";

/** Validate a stored public reference without fetching it or changing Files visibility. */
export function validateFavicon(value: unknown): string {
    if (typeof value !== "string" || value.length > 4096 || /[\u0000-\u001f\u007f\\]/.test(value)) {
        throw new ContentValidationError(
            "site.favicon",
            "a bounded public HTTP(S) URL or root-relative path is required",
        );
    }
    const candidate = value.trim();
    if (!candidate) {
        return "";
    }
    try {
        if (candidate.startsWith("//")) {
            throw new Error("Network-relative references are ambiguous");
        }
        const url = candidate.startsWith("/") ? new URL(candidate, "https://content.invalid") : new URL(candidate);
        if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
            throw new Error("Invalid public reference");
        }
        return candidate;
    } catch {
        throw new ContentValidationError("site.favicon", "a public HTTP(S) URL or root-relative path is required");
    }
}
