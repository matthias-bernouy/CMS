import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { TPageRef, TSystem } from "@bernouy/cms-content";
import { coercePageRef, defaultSystem } from "@bernouy/cms-content";

export type SettingsUpdateDto = Partial<TSystem>;

/**
 * Validates a flat dotted body (as emitted by the admin settings forms) against the
 * settings-update contract and produces a nested `Partial<TSystem>`.
 * `site.notFound` / `site.serverError` are coerced from `string` to
 * `TPageRef` (`""` → `null`, `"/path"` → `{ path }`).
 */
export function parseSettingsUpdateDto(body: Record<string, unknown>): SettingsUpdateDto {
    const dto: SettingsUpdateDto = {};

    if (hasSectionKey(body, "site")) {
        dto.site = {
            ...collectStringSection(body, "site", ["notFound", "serverError"]),
            notFound:    asPageRef(body["site.notFound"]),
            serverError: asPageRef(body["site.serverError"]),
        } as TSystem["site"];
    }

    if (hasSectionKey(body, "editor")) {
        const editor: Partial<TSystem["editor"]> = {};
        if ("editor.layoutCategory" in body) {
            const value = body["editor.layoutCategory"];
            if (typeof value !== "string") throw new InvalidParam("editor.layoutCategory", "expected a string.");
            editor.layoutCategory = value;
        }
        dto.editor = editor as TSystem["editor"];
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
        if ("email.enabled" in body) email.enabled = asBoolean(body["email.enabled"], "email.enabled");
        if ("email.fromEmail" in body) email.fromEmail = asString(body["email.fromEmail"], "email.fromEmail");
        if ("email.fromName" in body) email.fromName = asString(body["email.fromName"], "email.fromName");
        if ("email.replyTo" in body) email.replyTo = asString(body["email.replyTo"], "email.replyTo");
        if ("email.transport" in body) email.transport = asString(body["email.transport"], "email.transport") as TSystem["email"]["transport"];
        if ("email.smtp.host" in body) email.smtp.host = asString(body["email.smtp.host"], "email.smtp.host");
        if ("email.smtp.port" in body) email.smtp.port = asInteger(body["email.smtp.port"], "email.smtp.port");
        if ("email.smtp.secure" in body) email.smtp.secure = asBoolean(body["email.smtp.secure"], "email.smtp.secure");
        if ("email.smtp.username" in body) email.smtp.username = asString(body["email.smtp.username"], "email.smtp.username");
        if ("email.smtp.passwordSecretRef" in body) email.smtp.passwordSecretRef = asString(body["email.smtp.passwordSecretRef"], "email.smtp.passwordSecretRef");
        parseEmailTemplate(body, email, "emailVerification");
        parseEmailTemplate(body, email, "passwordReset");
        dto.email = email;
    }

    return dto;
}

/** Split a multiline origin list (one per line) into trimmed non-empty
 *  strings. The URL-validity + normalization rule runs at write time in
 *  cms-content's `validateSettingsPatch`. */
function parseOriginList(raw: unknown, paramName: string): string[] {
    if (raw === undefined || raw === null || raw === "") return [];
    if (typeof raw !== "string") throw new InvalidParam(paramName, "expected a string.");
    return raw.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function asString(raw: unknown, paramName: string): string {
    if (raw === undefined || raw === null) return "";
    if (typeof raw !== "string") throw new InvalidParam(paramName, "expected a string.");
    return raw;
}

function asBoolean(raw: unknown, paramName: string): boolean {
    if (typeof raw === "boolean") return raw;
    if (raw === undefined || raw === null || raw === "") return false;
    if (typeof raw !== "string") throw new InvalidParam(paramName, "expected a boolean.");
    const value = raw.trim().toLowerCase();
    if (["1", "true", "on", "yes"].includes(value)) return true;
    if (["0", "false", "off", "no"].includes(value)) return false;
    throw new InvalidParam(paramName, "expected a boolean.");
}

function asInteger(raw: unknown, paramName: string): number {
    if (typeof raw === "number" && Number.isInteger(raw)) return raw;
    if (typeof raw !== "string") throw new InvalidParam(paramName, "expected an integer.");
    const value = Number(raw);
    if (!Number.isInteger(value)) throw new InvalidParam(paramName, "expected an integer.");
    return value;
}

function parseEmailTemplate(
    body: Record<string, unknown>,
    email: TSystem["email"],
    key: keyof TSystem["email"]["templates"],
): void {
    const prefix = `email.templates.${key}`;
    if (`${prefix}.subject` in body) email.templates[key].subject = asString(body[`${prefix}.subject`], `${prefix}.subject`);
    if (`${prefix}.html`    in body) email.templates[key].html    = asString(body[`${prefix}.html`],    `${prefix}.html`);
}

function hasSectionKey(body: Record<string, unknown>, prefix: string): boolean {
    const head = `${prefix}.`;
    for (const key of Object.keys(body)) {
        if (key.startsWith(head)) return true;
    }
    return false;
}

function collectStringSection(
    body: Record<string, unknown>,
    prefix: string,
    excludeLeaves: string[],
): Record<string, string> {
    const out: Record<string, string> = {};
    const head = `${prefix}.`;
    const exclude = new Set(excludeLeaves);
    for (const [key, value] of Object.entries(body)) {
        if (!key.startsWith(head)) continue;
        const leaf = key.slice(head.length);
        if (exclude.has(leaf)) continue;
        if (typeof value !== "string") {
            throw new InvalidParam(key, "expected a string.");
        }
        out[leaf] = value;
    }
    return out;
}

function asPageRef(raw: unknown): TPageRef {
    if (raw !== undefined && raw !== null && raw !== "" && typeof raw !== "string") {
        throw new InvalidParam("page reference", "expected a string.");
    }
    return coercePageRef(raw);
}
