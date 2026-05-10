import type { CookieAttributes, ExtractAction, OnMissingStrategy, SameSite } from "../../../interfaces/proxy/ProxyRule";
import {
    ProxyRulesParseError,
    optionalBoolean, optionalNumber, optionalString,
    requireNumber, requireOneOf, requireObject, requireString,
} from "./parseHelpers";

const SAME_SITE: readonly SameSite[]               = ["Strict", "Lax", "None"];
const ON_MISSING: readonly OnMissingStrategy["type"][] = ["redirect", "status", "silent_refresh"];
const EXTRACT_ACTION: readonly ExtractAction["type"][] = ["set_cookie", "set_header"];

export function parseCookieAttributes(raw: unknown, path: string): CookieAttributes | undefined {
    if (raw === undefined) return undefined;
    const obj = requireObject(raw, path);
    const same_site = obj["same_site"] === undefined
        ? undefined
        : requireOneOf(obj["same_site"], `${path}.same_site`, SAME_SITE);
    const out: CookieAttributes = {};
    const max_age   = optionalNumber (obj["max_age"],   `${path}.max_age`);
    const p         = optionalString (obj["path"],      `${path}.path`);
    const domain    = optionalString (obj["domain"],    `${path}.domain`);
    const http_only = optionalBoolean(obj["http_only"], `${path}.http_only`);
    const secure    = optionalBoolean(obj["secure"],    `${path}.secure`);
    if (max_age   !== undefined) out.max_age   = max_age;
    if (p         !== undefined) out.path      = p;
    if (domain    !== undefined) out.domain    = domain;
    if (http_only !== undefined) out.http_only = http_only;
    if (secure    !== undefined) out.secure    = secure;
    if (same_site !== undefined) out.same_site = same_site;
    return out;
}

export function parseOnMissingStrategy(raw: unknown, path: string): OnMissingStrategy {
    const obj  = requireObject(raw, path);
    const type = requireOneOf(obj["type"], `${path}.type`, ON_MISSING);
    switch (type) {
        case "redirect":
            return { type, url: requireString(obj["url"], `${path}.url`) };
        case "status":
            return { type, code: requireNumber(obj["code"], `${path}.code`) };
        case "silent_refresh":
            return { type, refresh_path: requireString(obj["refresh_path"], `${path}.refresh_path`) };
    }
}

export function parseExtractAction(raw: unknown, path: string): ExtractAction {
    const obj  = requireObject(raw, path);
    const type = requireOneOf(obj["type"], `${path}.type`, EXTRACT_ACTION);
    switch (type) {
        case "set_cookie": {
            const name       = requireString(obj["name"], `${path}.name`);
            const attributes = parseCookieAttributes(obj["attributes"], `${path}.attributes`);
            return attributes !== undefined
                ? { type, name, attributes }
                : { type, name };
        }
        case "set_header":
            return { type, name: requireString(obj["name"], `${path}.name`) };
    }
}

export function unreachable(path: string, value: never): never {
    throw new ProxyRulesParseError(path, `unreachable: ${JSON.stringify(value)}`);
}
