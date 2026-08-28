import { defaultSystem, type TSystem } from "@bernouy/cms-content";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import {
    asBoolean,
    asInteger,
    asPageRef,
    asString,
    hasSectionKey,
    parseEmailTemplate,
    parseOriginList,
    parseTokenList,
} from "./valueParsers";

export type SettingsUpdateDto = Partial<TSystem>;

/**
 * Validates a flat dotted body (as emitted by the admin settings forms) against the
 * settings-update contract and produces a nested `Partial<TSystem>`.
 * System-page references are coerced from `string` to
 * `TPageRef` (`""` → `null`, `"/path"` → `{ path }`).
 */
export function parseSettingsUpdateDto(body: Record<string, unknown>): SettingsUpdateDto {
    const dto: SettingsUpdateDto = {};

    if (hasSectionKey(body, "site")) {
        dto.site = parseSiteSettings(body);
    }

    if ("theme" in body) {
        const value = body.theme;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new InvalidParam("theme", "expected an object.");
        }
        dto.theme = value as TSystem["theme"];
    }

    if (hasSectionKey(body, "security")) {
        const sec: Partial<TSystem["security"]> = {};
        if ("security.connectExtras" in body) {
            sec.connectExtras = parseOriginList(body["security.connectExtras"], "security.connectExtras");
        }
        if ("security.mediaExtras" in body) {
            sec.mediaExtras = parseOriginList(body["security.mediaExtras"], "security.mediaExtras");
        }
        dto.security = sec as TSystem["security"];
    }

    if (hasSectionKey(body, "email")) {
        const email = defaultSystem().email;
        if ("email.enabled" in body) {
            email.enabled = asBoolean(body["email.enabled"], "email.enabled");
        }
        if ("email.fromEmail" in body) {
            email.fromEmail = asString(body["email.fromEmail"], "email.fromEmail");
        }
        if ("email.fromName" in body) {
            email.fromName = asString(body["email.fromName"], "email.fromName");
        }
        if ("email.replyTo" in body) {
            email.replyTo = asString(body["email.replyTo"], "email.replyTo");
        }
        if ("email.transport" in body) {
            email.transport = asString(body["email.transport"], "email.transport") as TSystem["email"]["transport"];
        }
        if ("email.smtp.host" in body) {
            email.smtp.host = asString(body["email.smtp.host"], "email.smtp.host");
        }
        if ("email.smtp.port" in body) {
            email.smtp.port = asInteger(body["email.smtp.port"], "email.smtp.port");
        }
        if ("email.smtp.secure" in body) {
            email.smtp.secure = asBoolean(body["email.smtp.secure"], "email.smtp.secure");
        }
        if ("email.smtp.username" in body) {
            email.smtp.username = asString(body["email.smtp.username"], "email.smtp.username");
        }
        if ("email.smtp.passwordSecretRef" in body) {
            email.smtp.passwordSecretRef = asString(
                body["email.smtp.passwordSecretRef"],
                "email.smtp.passwordSecretRef",
            );
        }
        parseEmailTemplate(body, email, "emailVerification");
        parseEmailTemplate(body, email, "passwordReset");
        dto.email = email;
    }

    return dto;
}

function parseSiteSettings(body: Record<string, unknown>): TSystem["site"] {
    const site: Partial<TSystem["site"]> = {};
    for (const field of ["name", "favicon", "host", "language", "theme"] as const) {
        const key = `site.${field}`;
        if (key in body) {
            site[field] = asString(body[key], key);
        }
    }
    if ("site.visible" in body) {
        site.visible = asBoolean(body["site.visible"], "site.visible");
    }
    for (const field of ["notFound", "forbidden", "serverError", "login"] as const) {
        const key = `site.${field}`;
        if (key in body) {
            site[field] = asPageRef(body[key]);
        }
    }
    if (hasSectionKey(body, "site.organization")) {
        site.organization = parseSiteOrganization(body);
    }
    return site as TSystem["site"];
}

function parseSiteOrganization(body: Record<string, unknown>): TSystem["site"]["organization"] {
    const organization = {} as TSystem["site"]["organization"];
    for (const field of ["name", "legalName", "description", "logo", "email", "telephone"] as const) {
        const key = `site.organization.${field}`;
        if (key in body) {
            organization[field] = asString(body[key], key);
        }
    }

    const address = {} as TSystem["site"]["organization"]["address"];
    for (const field of [
        "streetAddress",
        "postalCode",
        "addressLocality",
        "addressRegion",
        "addressCountry",
    ] as const) {
        const key = `site.organization.address.${field}`;
        if (key in body) {
            address[field] = asString(body[key], key);
        }
    }
    organization.address = address;

    if ("site.organization.sameAs" in body) {
        organization.sameAs = parseTokenList(body["site.organization.sameAs"], "site.organization.sameAs");
    }
    return organization;
}
