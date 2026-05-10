import type { ProxyRule, ProxyRuleType } from "../../../interfaces/proxy/ProxyRule";
import type { CompileContext, EmittedSnippet, RuleEmitter } from "../../../interfaces/proxy/EmittedSnippet";
import { REQUEST_EMITTERS  } from "./emitRequestRules";
import { RESPONSE_EMITTERS } from "./emitResponseRules";

/**
 * Single dispatch table covering every primitive. `satisfies` ensures a
 * compile-time exhaustiveness check: a missing or extra arm here would
 * be a type error.
 */
const EMITTERS = {
    ...REQUEST_EMITTERS,
    ...RESPONSE_EMITTERS,
} satisfies Record<ProxyRuleType, RuleEmitter<never>>;

export function emitRule(rule: ProxyRule, ctx: CompileContext): EmittedSnippet[] {
    const emitter = EMITTERS[rule.type] as RuleEmitter<ProxyRule>;
    return emitter(rule, ctx);
}
