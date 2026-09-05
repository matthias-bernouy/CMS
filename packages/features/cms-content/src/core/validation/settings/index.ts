import type { SiteOrganizationAddress, SiteOrganizationSettings, TSystem } from "cms-content/interfaces/settings";
import { ContentValidationError } from "cms-content/core/validation/errors";
import { validateThemeSettings } from "cms-content/core/theme";
import { validateEmailSettings } from "./email";
import { validateSiteOrganizationPatch } from "./organization";

type SiteOrganizationPatch = Omit<Partial<SiteOrganizationSettings>, "address"> & {
    address?: Partial<SiteOrganizationAddress>;
};

type SiteSettingsPatch = Omit<Partial<TSystem["site"]>, "organization"> & {
    organization?: SiteOrganizationPatch;
};

type SettingsPatch = Omit<Partial<TSystem>, "email" | "site"> & {
    email?: Partial<TSystem["email"]>;
    site?: SiteSettingsPatch;
};

/** Validate and normalize the settings fields governed by domain rules. */
export function validateSettingsPatch(patch: SettingsPatch): Partial<TSystem> {
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
        normalized.site = site as TSystem["site"];
    }

    if (patch.security) {
        const security = { ...patch.security };
        if (security.connectExtras !== undefined) {
            security.connectExtras = validateOrigins("connectExtras", security.connectExtras);
        }
        if (security.mediaExtras !== undefined) {
            security.mediaExtras = validateOrigins("mediaExtras", security.mediaExtras);
        }
        normalized.security = security;
    }

    if (patch.email) {
        normalized.email = validateEmailSettings(patch.email);
    }

    if (patch.theme) {
        normalized.theme = validateThemeSettings(patch.theme);
    }

    return normalized;
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

function validateOrigins(field: string, origins: string[]): string[] {
    const out = new Set<string>();
    for (const raw of origins) {
        const trimmed = raw.trim();
        if (!trimmed) {
            continue;
        }
        let origin: string;
        try {
            origin = new URL(trimmed).origin;
        } catch {
            throw new ContentValidationError(field, `invalid URL: "${trimmed}"`);
        }
        if (!origin || origin === "null") {
            throw new ContentValidationError(field, `URL has no origin: "${trimmed}"`);
        }
        out.add(origin);
    }
    return [...out];
}
