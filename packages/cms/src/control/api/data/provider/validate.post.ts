import type { ControlCms } from "src/control/ControlCms";
import { readJsonBody } from "src/control/core/http/readJsonBody";
import {
    parseRulesConfig, validateRules, compileRulesConfig,
    ProxyRulesParseError, ProxyRulesValidationError,
} from "@bernouy/cdn-buckets";

/**
 * POST /api/data/provider/validate
 *
 * Dry-run for the data-provider editor. Mirrors cdn-buckets's
 * `/admin/api/proxies/validate` but lives in the CMS so the tenant UI
 * doesn't need to hop through the cdn-buckets admin surface (which
 * uses a different auth chain).
 *
 * Body : { rules: <json string|object>, secrets?: { [envName]: string } }
 *   - `rules`   required. May be the JSON string from the textarea OR
 *               an already-parsed object (for callers that pre-parsed).
 *   - `secrets` optional. When provided, also runs the coverage check.
 *
 * Returns:
 *   `{ ok: true,  referenced: string[] }`            — env names referenced by rules
 *   `{ ok: false, errors: [{ path, message }] }`     — first failure only
 */
export default async function postValidate(req: Request, _cms: ControlCms) {
    const body = await readJsonBody(req);
    const result = run(body);
    return new Response(JSON.stringify(result), {
        headers: { "Content-Type": "application/json" },
    });
}

type Result =
    | { ok: true;  referenced: string[] }
    | { ok: false; errors: Array<{ path: string; message: string }> };

function run(body: Record<string, unknown>): Result {
    try {
        const rules     = parseRulesConfig(parseInputRules(body.rules));
        validateRules(rules);
        const compiled = compileRulesConfig(rules, {
            bucketId:     "validate",
            providerId:   "validate",
            server:       "https://validate.local",
            emitFallback: true,
        });
        const referenced = [...compiled.secrets.keys()].sort();

        if (body.secrets !== undefined) {
            const secrets = parseSecrets(body.secrets);
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
}

function parseInputRules(v: unknown): unknown {
    if (typeof v === "string") {
        try { return JSON.parse(v); }
        catch (e) { throw new TypeError(`rules: not valid JSON (${(e as Error).message})`); }
    }
    return v;
}

function parseSecrets(v: unknown): Record<string, string> {
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
