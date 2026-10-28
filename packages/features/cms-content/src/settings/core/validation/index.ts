import type {
    SiteOrganizationAddress,
    SiteOrganizationSettings,
    TSystem,
} from "cms-content/settings/interfaces/settings";
import { ContentValidationError } from "cms-content/application/core/validation/errors";
import { validateThemeSettings } from "cms-content/theme/core";
import { validateSiteOrganizationPatch } from "cms-content/settings/core/validation/organization";
import { validatePageReference } from "cms-content/pages/core/routing/values";

type SiteOrganizationPatch = Omit<Partial<SiteOrganizationSettings>, "address"> & {
    address?: Partial<SiteOrganizationAddress>;
};

type SiteSettingsPatch = Omit<Partial<TSystem["site"]>, "organization"> & {
    organization?: SiteOrganizationPatch;
};

type SettingsPatch = Omit<Partial<TSystem>, "site"> & {
    site?: SiteSettingsPatch;
};

/** Validate and normalize the settings fields governed by domain rules. */
export function validateSettingsPatch(patch: SettingsPatch): Partial<TSystem> {
    for (const name of Object.keys(patch)) {
        if (!["initializationStep", "pageRoutesUpdating", "site", "theme"].includes(name)) {
            throw new ContentValidationError(name, "unknown Content settings field");
        }
    }
    const normalized = { ...patch } as Partial<TSystem>;

    if (patch.site) {
        if (Object.hasOwn(patch.site, "theme")) {
            throw new ContentValidationError(
                "site.theme",
                "free-form CSS is not supported; use structured theme settings",
            );
        }
        const site = { ...patch.site };
        if (site.host !== undefined) {
            if (typeof site.host !== "string") {
                throw new ContentValidationError("site.host", "string expected");
            }
            const host = canonicalSiteBaseUrl(site.host);
            if (site.host.trim() && !host) {
                throw new ContentValidationError(
                    "site.host",
                    "must be an absolute HTTP(S) URL without credentials, query, or fragment",
                );
            }
            site.host = host ?? "";
        }
        if (site.organization !== undefined) {
            site.organization = validateSiteOrganizationPatch(site.organization);
        }
        if (site.additionalLanguages !== undefined) {
            site.additionalLanguages = validateLanguageList(site.additionalLanguages, "site.additionalLanguages");
        }
        if (site.activeLanguages !== undefined) {
            site.activeLanguages = validateLanguageList(site.activeLanguages, "site.activeLanguages");
        }
        for (const field of ["notFound", "forbidden", "serverError", "login"] as const) {
            if (site[field] !== undefined && site[field] !== null) {
                try {
                    site[field] = validatePageReference(site[field]);
                } catch {
                    throw new ContentValidationError(`site.${field}`, "invalid Page reference");
                }
            }
        }
        normalized.site = site as TSystem["site"];
    }

    if (patch.theme) {
        normalized.theme = validateThemeSettings(patch.theme);
    }

    return normalized;
}

function validateLanguageList(value: unknown, field: string): string[] {
    if (!Array.isArray(value) || value.length > 32) {
        throw new ContentValidationError(field, "expected up to 32 language tags");
    }
    const languages = new Set<string>();
    for (const tag of value) {
        if (typeof tag !== "string" || !tag.trim()) {
            throw new ContentValidationError(field, "invalid language tag");
        }
        try {
            const canonical = Intl.getCanonicalLocales(tag.trim())[0];
            if (!canonical) {
                throw new Error("missing language tag");
            }
            languages.add(canonical);
        } catch {
            throw new ContentValidationError(field, "invalid language tag");
        }
    }
    return [...languages].sort();
}

/** Return the normalized public SEO base URL, or null when it cannot safely be published. */
export function canonicalSiteBaseUrl(value: unknown): string | null {
    if (typeof value !== "string") {
        return null;
    }
    const candidate = value.trim();
    if (!candidate) {
        return null;
    }
    try {
        const url = new URL(candidate);
        if (
            (url.protocol !== "http:" && url.protocol !== "https:") ||
            url.username ||
            url.password ||
            candidate.includes("?") ||
            candidate.includes("#")
        ) {
            return null;
        }
        url.pathname = url.pathname.replace(/\/+$/u, "") || "/";
        return url.href.replace(/\/$/u, "");
    } catch {
        return null;
    }
}
