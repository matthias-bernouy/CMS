import type { RulesConfig } from "@bernouy/cdn-buckets";
import { parseRulesConfig, validateRules, ProxyRulesParseError, ProxyRulesValidationError } from "@bernouy/cdn-buckets";
import InvalidParam from "src/control/errors/Http/InvalidParam";

const ENV_NAME_RE = /^[A-Z][A-Z0-9_]*$/;

/**
 * Parse `rules` (JSON string from the form textarea) and collect
 * `secrets.<envName>` flat-key entries from the same body. Validates
 * the rules through cdn-buckets's parser/validator and enforces the
 * coverage contract: every `${env:NAME}` referenced by `rules` MUST
 * have a matching `secrets[NAME]`, and every `secrets` entry MUST be
 * referenced.
 *
 * Throws `InvalidParam` (which the wrapping admin endpoint maps to a
 * 400) with a JSON-pointer-like path in the message.
 */
export function parseRulesAndSecrets(body: Record<string, unknown>): { rules: RulesConfig; secrets: Record<string, string> } {
    const rulesRaw = body["rules"];
    if (rulesRaw === undefined || rulesRaw === null || rulesRaw === "") {
        // Default: empty rules (catch-all forward to upstream, no extras).
        return { rules: { paths: {} }, secrets: collectSecrets(body) };
    }
    if (typeof rulesRaw !== "string") {
        throw new InvalidParam("rules", "Must be a JSON string.");
    }

    let parsed: unknown;
    try { parsed = JSON.parse(rulesRaw); }
    catch (e) { throw new InvalidParam("rules", `Not valid JSON: ${(e as Error).message}`); }

    let rules: RulesConfig;
    try { rules = parseRulesConfig(parsed); validateRules(rules); }
    catch (e) {
        if (e instanceof ProxyRulesParseError || e instanceof ProxyRulesValidationError) {
            throw new InvalidParam("rules", `${e.path}: ${e.message.replace(`${e.path}: `, "")}`);
        }
        throw e;
    }

    return { rules, secrets: collectSecrets(body) };
}

function collectSecrets(body: Record<string, unknown>): Record<string, string> {
    const out: Record<string, string> = {};
    for (const [key, val] of Object.entries(body)) {
        if (!key.startsWith("secrets.")) continue;
        const envName = key.slice("secrets.".length);
        if (!ENV_NAME_RE.test(envName)) {
            throw new InvalidParam(key, `Secret name must match /^[A-Z][A-Z0-9_]*$/.`);
        }
        if (typeof val !== "string") {
            throw new InvalidParam(key, "Secret value must be a string.");
        }
        out[envName] = val;
    }
    return out;
}

/**
 * Returns true if any `rules` or `secrets.*` field is in the body.
 * Lets update DTOs detect "patch this section" without forcing the
 * client to send an empty `rules` when only specAuth changed.
 */
export function hasRulesFields(body: Record<string, unknown>): boolean {
    if (body["rules"] !== undefined) return true;
    for (const key of Object.keys(body)) {
        if (key.startsWith("secrets.")) return true;
    }
    return false;
}
