import type { DefaultRules, HttpMethod, PathRules, RulesConfig } from "../../../interfaces/proxy/RulesConfig";
import type { ProxyRule, RulePhase } from "../../../interfaces/proxy/ProxyRule";
import {
    ProxyRulesParseError, requireArray, requireObject, requireOneOf,
} from "./parseHelpers";
import { parseRule } from "./parseRule";

const HTTP_METHODS: readonly HttpMethod[] =
    ["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"];

function parseRulesArray(raw: unknown, path: string, phase: RulePhase): ProxyRule[] {
    const arr = requireArray(raw, path);
    return arr.map((item, i) => parseRule(item, `${path}[${i}]`, phase));
}

function parsePhasePair<P extends { on_request?: ProxyRule[]; on_response?: ProxyRule[] }>(
    raw: Record<string, unknown>,
    path: string,
): P {
    const out = {} as P;
    if (raw["on_request"] !== undefined) {
        out.on_request = parseRulesArray(raw["on_request"], `${path}.on_request`, "request");
    }
    if (raw["on_response"] !== undefined) {
        out.on_response = parseRulesArray(raw["on_response"], `${path}.on_response`, "response");
    }
    return out;
}

function parsePathRules(raw: unknown, path: string): PathRules {
    const obj = requireObject(raw, path);
    const out = parsePhasePair<PathRules>(obj, path);
    if (obj["methods"] !== undefined) {
        const arr = requireArray(obj["methods"], `${path}.methods`);
        out.methods = arr.map((m, i) =>
            requireOneOf(m, `${path}.methods[${i}]`, HTTP_METHODS),
        );
    }
    return out;
}

function parseDefaults(raw: unknown, path: string): DefaultRules {
    const obj = requireObject(raw, path);
    return parsePhasePair<DefaultRules>(obj, path);
}

/**
 * Top-level entry point: takes the raw object decoded from YAML/JSON
 * and returns a typed `RulesConfig`. Throws `ProxyRulesParseError` with
 * a JSON-pointer-style path on the first invalid field.
 */
export function parseRulesConfig(raw: unknown): RulesConfig {
    const obj   = requireObject(raw, "$");
    const paths = requireObject(obj["paths"], "$.paths");

    const out: RulesConfig = { paths: {} };
    if (obj["defaults"] !== undefined) {
        out.defaults = parseDefaults(obj["defaults"], "$.defaults");
    }
    for (const pattern of Object.keys(paths)) {
        if (pattern.length === 0) {
            throw new ProxyRulesParseError("$.paths", "path patterns must be non-empty strings");
        }
        out.paths[pattern] = parsePathRules(paths[pattern], `$.paths["${pattern}"]`);
    }
    return out;
}
