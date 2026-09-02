import type { JsonRecord, StripeBusinessType } from "../../shared/types.ts";
import { HttpError } from "../errors.ts";

export function requiredString(body: JsonRecord, name: string, maxLength: number): string {
    const value = body[name];
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} is required`);
    }
    const normalized = value.trim();
    if (!normalized) {
        throw new HttpError(400, `${name} is required`);
    }
    if (normalized.length > maxLength) {
        throw new HttpError(400, `${name} is too long`);
    }
    return normalized;
}

export function requiredHash(body: JsonRecord, name: string): string {
    const value = requiredString(body, name, 64).toLowerCase();
    if (!/^[a-f0-9]{64}$/.test(value)) {
        throw new HttpError(400, `${name} must be a SHA-256 hex digest`);
    }
    return value;
}

export function marketplaceTermsExpectationFromBody(body: JsonRecord): { version: string; hash: string } | null {
    return termsExpectationFromBody(body, "marketplaceTermsVersion", "marketplaceTermsHash");
}

export function marketplaceTermsAcceptanceExpectationFromBody(
    body: JsonRecord,
): { version: string; hash: string } | null {
    return termsExpectationFromBody(body, "expectedMarketplaceTermsVersion", "expectedMarketplaceTermsHash");
}

function termsExpectationFromBody(
    body: JsonRecord,
    versionName: string,
    hashName: string,
): { version: string; hash: string } | null {
    const hasVersion = body[versionName] !== undefined && body[versionName] !== null;
    const hasHash = body[hashName] !== undefined && body[hashName] !== null;
    if (!hasVersion && !hasHash) {
        return null;
    }
    if (!hasVersion || !hasHash) {
        throw new HttpError(400, `${versionName} and ${hashName} must be provided together`);
    }
    return {
        version: requiredString(body, versionName, 200),
        hash: requiredHash(body, hashName),
    };
}

export function marketplaceTermsExpectationFromRequest(request: Request): { version: string; hash: string } | null {
    const params = new URL(request.url).searchParams;
    const version = params.get("marketplaceTermsVersion");
    const hash = params.get("marketplaceTermsHash");
    if (version === null && hash === null) {
        return null;
    }
    return marketplaceTermsExpectationFromBody({
        marketplaceTermsVersion: version,
        marketplaceTermsHash: hash,
    });
}

export function optionalText(body: JsonRecord, name: string, maxLength: number): string | null {
    const value = body[name];
    if (value === undefined || value === null) {
        return null;
    }
    if (typeof value !== "string") {
        throw new HttpError(400, `${name} must be a string`);
    }
    const normalized = value.trim();
    if (!normalized) {
        return null;
    }
    if (normalized.length > maxLength) {
        throw new HttpError(400, `${name} is too long`);
    }
    return normalized;
}

export function requiredStripeToken(body: JsonRecord, name: string, prefix: string): string {
    const value = requiredString(body, name, 500);
    if (!value.startsWith(prefix) || !/^[A-Za-z0-9_]+$/.test(value)) {
        throw new HttpError(400, `${name} is invalid`);
    }
    return value;
}

export function optionalStripeToken(body: JsonRecord, name: string, prefix: string): string | null {
    const value = optionalText(body, name, 500);
    if (!value) {
        return null;
    }
    if (!value.startsWith(prefix) || !/^[A-Za-z0-9_]+$/.test(value)) {
        throw new HttpError(400, `${name} is invalid`);
    }
    return value;
}

export function optionalEmail(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 320);
    if (!value) {
        return null;
    }
    const email = value.toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
        throw new HttpError(400, `${name} is invalid`);
    }
    return email;
}

export function optionalCountry(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 2);
    if (!value) {
        return null;
    }
    const country = value.toUpperCase();
    if (!/^[A-Z]{2}$/.test(country)) {
        throw new HttpError(400, `${name} must be a two-letter country code`);
    }
    return country;
}

export function optionalCurrency(body: JsonRecord, name: string): string | null {
    const value = optionalText(body, name, 3);
    if (!value) {
        return null;
    }
    const currency = value.toLowerCase();
    if (!/^[a-z]{3}$/.test(currency)) {
        throw new HttpError(400, `${name} must be a three-letter currency code`);
    }
    return currency;
}

export function validBusinessType(value: unknown): value is StripeBusinessType {
    return value === "company" || value === "government_entity" || value === "individual" || value === "non_profit";
}
