import type { ProxyRule, ProxyRuleType, RulePhase } from "../../../interfaces/proxy/ProxyRule";
import {
    ProxyRulesParseError, optionalBoolean, optionalString,
    requireNumber, requireObject, requireOneOf, requireString, requireStringArray,
} from "./parseHelpers";
import { parseCookieAttributes, parseExtractAction, parseOnMissingStrategy } from "./parseRuleSubParts";
import { RULE_PHASES } from "./rulePhases";

type RuleParser<R extends ProxyRule> = (raw: Record<string, unknown>, path: string) => R;

const PARSERS: { [K in ProxyRuleType]: RuleParser<Extract<ProxyRule, { type: K }>> } = {
    require_cookie: (o, p) => ({
        type: "require_cookie",
        name: requireString(o["name"], `${p}.name`),
        on_missing: parseOnMissingStrategy(o["on_missing"], `${p}.on_missing`),
    }),
    require_header: (o, p) => ({
        type: "require_header",
        name: requireString(o["name"], `${p}.name`),
        on_missing: parseOnMissingStrategy(o["on_missing"], `${p}.on_missing`),
    }),
    cookie_to_header: (o, p) => {
        const prefix = optionalString(o["prefix"], `${p}.prefix`);
        const base = {
            type:        "cookie_to_header" as const,
            cookie_name: requireString(o["cookie_name"], `${p}.cookie_name`),
            header_name: requireString(o["header_name"], `${p}.header_name`),
        };
        return prefix !== undefined ? { ...base, prefix } : base;
    },
    cookie_to_body_field: (o, p) => ({
        type:        "cookie_to_body_field",
        cookie_name: requireString(o["cookie_name"], `${p}.cookie_name`),
        body_field:  requireString(o["body_field"],  `${p}.body_field`),
    }),
    inject_header: (o, p) => ({
        type:  "inject_header",
        name:  requireString(o["name"],  `${p}.name`),
        value: requireString(o["value"], `${p}.value`),
    }),
    inject_cookie: (o, p) => {
        const attributes = parseCookieAttributes(o["attributes"], `${p}.attributes`);
        const base = {
            type:  "inject_cookie" as const,
            name:  requireString(o["name"],  `${p}.name`),
            value: requireString(o["value"], `${p}.value`),
        };
        return attributes !== undefined ? { ...base, attributes } : base;
    },
    extract_json: (o, p) => {
        const strip = optionalBoolean(o["strip_from_body"], `${p}.strip_from_body`);
        const base = {
            type:   "extract_json" as const,
            field:  requireString(o["field"], `${p}.field`),
            action: parseExtractAction(o["action"], `${p}.action`),
        };
        return strip !== undefined ? { ...base, strip_from_body: strip } : base;
    },
    strip_body_fields: (o, p) => ({
        type:   "strip_body_fields",
        fields: requireStringArray(o["fields"], `${p}.fields`),
    }),
    rewrite_status: (o, p) => {
        const ifField = optionalString(o["if_body_field"], `${p}.if_body_field`);
        const base = {
            type: "rewrite_status" as const,
            from: requireNumber(o["from"], `${p}.from`),
            to:   requireNumber(o["to"],   `${p}.to`),
        };
        return ifField !== undefined ? { ...base, if_body_field: ifField } : base;
    },
    extract_header_to_cookie: (o, p) => {
        const attributes = parseCookieAttributes(o["attributes"], `${p}.attributes`);
        const base = {
            type:        "extract_header_to_cookie" as const,
            header_name: requireString(o["header_name"], `${p}.header_name`),
            cookie_name: requireString(o["cookie_name"], `${p}.cookie_name`),
        };
        return attributes !== undefined ? { ...base, attributes } : base;
    },
};

const KNOWN_TYPES = Object.keys(PARSERS) as readonly ProxyRuleType[];

/**
 * Parse one rule. `expectedPhase` enforces phase placement (e.g. an
 * `extract_json` under `on_request` is rejected at parse time, not at
 * runtime).
 */
export function parseRule(raw: unknown, path: string, expectedPhase: RulePhase): ProxyRule {
    const obj  = requireObject(raw, path);
    const type = requireOneOf(obj["type"], `${path}.type`, KNOWN_TYPES);
    if (RULE_PHASES[type] !== expectedPhase) {
        throw new ProxyRulesParseError(
            path,
            `rule type "${type}" is a ${RULE_PHASES[type]}-phase rule, not allowed under on_${expectedPhase}`,
        );
    }
    return (PARSERS[type] as RuleParser<ProxyRule>)(obj, path);
}
