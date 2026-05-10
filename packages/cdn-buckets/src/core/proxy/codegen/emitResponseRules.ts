import type {
    CookieAttributes, ExtractAction, ExtractHeaderToCookieRule,
    ExtractJsonRule, RewriteStatusRule, StripBodyFieldsRule,
} from "../../../interfaces/proxy/ProxyRule";
import type { RuleEmitter } from "../../../interfaces/proxy/EmittedSnippet";

/**
 * Render a CookieAttributes block as the trailing `; HttpOnly; Secure; …`
 * portion of a Set-Cookie value. Defaults are conservative
 * (`HttpOnly`, `Secure`, `SameSite=Lax`) when the field isn't set.
 */
function cookieAttrSuffix(attrs?: CookieAttributes): string {
    const a       = attrs ?? {};
    const httpOnly = a.http_only ?? true;
    const secure   = a.secure    ?? true;
    const sameSite = a.same_site ?? "Lax";
    const parts = [
        a.path     ? `Path=${a.path}`         : "Path=/",
        a.domain   ? `Domain=${a.domain}`     : null,
        a.max_age !== undefined ? `Max-Age=${a.max_age}` : null,
        httpOnly   ? "HttpOnly"               : null,
        secure     ? "Secure"                 : null,
        `SameSite=${sameSite}`,
    ].filter(Boolean);
    return "; " + parts.join("; ");
}

function dataAccess(field: string): string {
    // Dot-notation `a.b.c` → `data["a"]["b"]["c"]`. Keeps simple field
    // names unambiguous and side-steps Lua identifier rules.
    return "data" + field.split(".").map(p => `[${JSON.stringify(p)}]`).join("");
}

// ── emitters ────────────────────────────────────────────────────────────

export const emitExtractJson: RuleEmitter<ExtractJsonRule> = (rule) => {
    const access = dataAccess(rule.field);
    const strip  = rule.strip_from_body !== false;
    const action = emitExtractAction(rule.action, access);
    const stripLine = strip ? `\n    ${access} = nil` : "";
    return [{
        kind: "body_mutation", phase: "response",
        code: `if ${access} then
    ${action}${stripLine}
end`,
    }];
};

function emitExtractAction(action: ExtractAction, valueExpr: string): string {
    if (action.type === "set_cookie") {
        const suffix = cookieAttrSuffix(action.attributes).replace(/"/g, '\\"');
        return `ngx.header["Set-Cookie"] = ${JSON.stringify(action.name + "=")} .. tostring(${valueExpr}) .. "${suffix}"`;
    }
    return `ngx.header[${JSON.stringify(action.name)}] = tostring(${valueExpr})`;
}

export const emitStripBodyFields: RuleEmitter<StripBodyFieldsRule> = (rule) => [{
    kind: "body_mutation", phase: "response",
    code: rule.fields.map(f => `${dataAccess(f)} = nil`).join("\n"),
}];

export const emitRewriteStatus: RuleEmitter<RewriteStatusRule> = (rule) => {
    if (rule.if_body_field === undefined) {
        return [{
            kind: "lua", phase: "response", hook: "header_filter",
            code: `if ngx.status == ${rule.from} then ngx.status = ${rule.to} end`,
        }];
    }
    // Conditional on body field: must run in body_filter (header_filter
    // runs before the body is available). The rewrite is reflected by
    // mutating ngx.status from inside the body mutation block.
    return [{
        kind: "body_mutation", phase: "response",
        code: `if ngx.status == ${rule.from} and ${dataAccess(rule.if_body_field)} ~= nil then
    ngx.status = ${rule.to}
end`,
    }];
};

/**
 * Capture an upstream response header into a Set-Cookie. Pure nginx via
 * `add_header` + the `$upstream_http_*` family. `always` flag is needed
 * so the Set-Cookie ships even on error responses (matching the
 * upstream's contract).
 */
export const emitExtractHeaderToCookie: RuleEmitter<ExtractHeaderToCookieRule> = (rule) => {
    const upstreamVar = "$upstream_http_" + rule.header_name.toLowerCase().replace(/-/g, "_");
    const suffix      = cookieAttrSuffix(rule.attributes);
    return [{
        kind:      "nginx", phase: "response",
        directive: `add_header Set-Cookie "${rule.cookie_name}=${upstreamVar}${suffix}" always;`,
    }];
};

export const RESPONSE_EMITTERS = {
    extract_json:             emitExtractJson,
    strip_body_fields:        emitStripBodyFields,
    rewrite_status:           emitRewriteStatus,
    extract_header_to_cookie: emitExtractHeaderToCookie,
} satisfies Record<string, RuleEmitter<never>>;
