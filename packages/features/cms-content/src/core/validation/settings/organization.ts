import type { SiteOrganizationAddress, SiteOrganizationSettings } from "cms-content/interfaces/settings";
import { ContentValidationError } from "cms-content/core/validation/errors";

type OrganizationPatch = Omit<Partial<SiteOrganizationSettings>, "address"> & {
    address?: Partial<SiteOrganizationAddress>;
};

const ORGANIZATION_STRING_FIELDS = ["name", "legalName", "description", "logo", "email", "telephone"] as const;
const ADDRESS_STRING_FIELDS = [
    "streetAddress",
    "postalCode",
    "addressLocality",
    "addressRegion",
    "addressCountry",
] as const;

export function validateSiteOrganizationPatch(value: unknown): OrganizationPatch {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError("site.organization", "object expected");
    }
    const patch = value as OrganizationPatch;
    const normalized: OrganizationPatch = { ...patch };

    for (const field of ORGANIZATION_STRING_FIELDS) {
        const value = patch[field];
        if (value === undefined) {
            continue;
        }
        if (typeof value !== "string") {
            throw new ContentValidationError(`site.organization.${field}`, "string expected");
        }
        normalized[field] = value.trim();
    }

    if (normalized.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized.email)) {
        throw new ContentValidationError("site.organization.email", "must be a valid email address.");
    }

    if (patch.address !== undefined) {
        normalized.address = normalizeAddress(patch.address);
    }
    if (patch.sameAs !== undefined) {
        normalized.sameAs = normalizeProfileUrls(patch.sameAs);
    }

    return normalized;
}

function normalizeAddress(value: unknown): Partial<SiteOrganizationAddress> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new ContentValidationError("site.organization.address", "object expected");
    }
    const address = value as Partial<SiteOrganizationAddress>;
    const normalized = { ...address };
    for (const field of ADDRESS_STRING_FIELDS) {
        const value = address[field];
        if (value === undefined) {
            continue;
        }
        if (typeof value !== "string") {
            throw new ContentValidationError(`site.organization.address.${field}`, "string expected");
        }
        normalized[field] = value.trim();
    }
    return normalized;
}

function normalizeProfileUrls(values: string[]): string[] {
    if (!Array.isArray(values)) {
        throw new ContentValidationError("site.organization.sameAs", "array expected");
    }
    const normalized = new Set<string>();
    for (const raw of values) {
        if (typeof raw !== "string") {
            throw new ContentValidationError("site.organization.sameAs", "URL strings expected");
        }
        const value = raw.trim();
        if (!value) {
            continue;
        }
        try {
            const url = new URL(value);
            if ((url.protocol !== "http:" && url.protocol !== "https:") || url.username || url.password) {
                throw new Error("unsafe URL");
            }
            normalized.add(url.href);
        } catch {
            throw new ContentValidationError("site.organization.sameAs", `invalid public HTTP(S) URL: "${value}"`);
        }
    }
    return [...normalized];
}
