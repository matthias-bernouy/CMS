import { wrapAdmin } from "../../../core/admin/wrapAdmin";
import { parseRulesConfig } from "../../../core/proxy/rules/parseRulesConfig";
import { validateRules, ProxyRulesValidationError } from "../../../core/proxy/rules/validateRules";
import { ProxyRulesParseError } from "../../../core/proxy/rules/parseHelpers";
import { compileRulesConfig } from "../../../core/proxy/codegen/compileRulesConfig";

/**
 * POST /admin/api/proxies/validate
 *
 * Dry-run for the proxy editor: parses + validates the same way
 * `upsertProxy` does, but never writes. Returns:
 *   `{ ok: true,  referenced: string[] }` — env names referenced by rules
 *   `{ ok: false, errors: [{ path, message }] }` — first failure only
 *
 * Body: { rules, secrets?, providerId?, server? }
 *   - `rules` required.
 *   - `secrets` optional — when provided, also runs the coverage check.
 *   - `providerId`/`server` optional placeholders for compileRulesConfig.
 */
export default wrapAdmin(async (req, _provider) => {
    const body = await req.json() as Record<string, unknown>;
    try {
        const rules     = parseRulesConfig(body.rules);
        validateRules(rules);

        const compiled = compileRulesConfig(rules, {
            bucketId:     "validate",
            providerId:   typeof body.providerId === "string" ? body.providerId : "validate",
            server:       typeof body.server     === "string" ? body.server     : "https://validate.local",
            emitFallback: true,
        });
        const referenced = [...compiled.secrets.keys()].sort();

        if (body.secrets !== undefined) {
            const secrets = parseSecretsObj(body.secrets);
            for (const ref of referenced) {
                if (!(ref in secrets)) throw new TypeError(`secrets["${ref}"] is missing.`);
            }
            for (const k of Object.keys(secrets)) {
                if (!referenced.includes(k)) throw new TypeError(`secrets["${k}"] is set but not referenced by any \${env:…}.`);
            }
        }
        return { ok: true, referenced };
    } catch (e) {
        if (e instanceof ProxyRulesParseError || e instanceof ProxyRulesValidationError) {
            return { ok: false, errors: [{ path: e.path, message: e.message.replace(`${e.path}: `, "") }] };
        }
        return { ok: false, errors: [{ path: "$", message: (e as Error).message }] };
    }
});

function parseSecretsObj(v: unknown): Record<string, string> {
    if (typeof v !== "object" || v === null || Array.isArray(v)) {
        throw new TypeError("'secrets' must be an object.");
    }
    const out: Record<string, string> = {};
    for (const [k, val] of Object.entries(v)) {
        if (typeof val !== "string") throw new TypeError(`secrets["${k}"] must be a string.`);
        out[k] = val;
    }
    return out;
}
