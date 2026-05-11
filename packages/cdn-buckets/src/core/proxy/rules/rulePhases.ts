import type { ProxyRule, ProxyRuleType, RulePhase } from "../../../interfaces/proxy/ProxyRule";

/**
 * Phase membership per rule type. Used by the parser to reject rules
 * placed in the wrong slot (e.g. `extract_json` under `on_request`) and
 * by the codegen to know which Lua hook (access_by_lua_block vs
 * body_filter_by_lua_block) to emit.
 */
export const RULE_PHASES: Record<ProxyRuleType, RulePhase> = {
    require_cookie:           "request",
    require_header:           "request",
    cookie_to_header:         "request",
    cookie_to_body_field:     "request",
    inject_header:            "request",
    inject_cookie:            "request",
    inject_query_param:       "request",
    extract_json:             "response",
    strip_body_fields:        "response",
    rewrite_status:           "response",
    extract_header_to_cookie: "response",
};

export function rulePhaseOf(rule: ProxyRule): RulePhase {
    return RULE_PHASES[rule.type];
}
