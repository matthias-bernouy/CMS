import { IntegrationRuntimeError } from "../../../core/errors";
import { detectAnonymousConstraints } from "./anonymous-constraints/detector";
import { tokenizeSqlForAnonymousConstraints } from "./anonymous-constraints/tokenizer";

export const ANONYMOUS_CONSTRAINT_LINT_LIMITS = Object.freeze({
    maxBytes: 8 * 1024 * 1024,
    maxTokens: 262_144,
    maxDepth: 256,
});

export type AnonymousConstraintLintLimits = {
    maxBytes?: number;
    maxTokens?: number;
    maxDepth?: number;
};

export type AnonymousConstraintFinding = {
    path: string;
    line: number;
    column: number;
    kind: "anonymous-check" | "anonymous-unique";
};

/**
 * Finds PostgreSQL constraints whose generated names would make an observed
 * schema contract unstable. This is deliberately a bounded lexer and focused
 * structural scan, not a general SQL parser.
 */
export function lintAnonymousConstraints(
    sql: string,
    path: string,
    limits: AnonymousConstraintLintLimits = {},
): AnonymousConstraintFinding[] {
    const source = path.trim();
    if (!source) {
        throw new IntegrationRuntimeError("Anonymous constraint lint requires a source path");
    }
    const resolved = {
        maxBytes: positiveLimit(limits.maxBytes, ANONYMOUS_CONSTRAINT_LINT_LIMITS.maxBytes, "maxBytes"),
        maxTokens: positiveLimit(limits.maxTokens, ANONYMOUS_CONSTRAINT_LINT_LIMITS.maxTokens, "maxTokens"),
        maxDepth: positiveLimit(limits.maxDepth, ANONYMOUS_CONSTRAINT_LINT_LIMITS.maxDepth, "maxDepth"),
    };
    const bytes = new TextEncoder().encode(sql).byteLength;
    if (bytes > resolved.maxBytes) {
        throw new IntegrationRuntimeError(
            `Anonymous constraint lint input ${source} exceeds ${resolved.maxBytes} bytes`,
        );
    }
    const tokens = tokenizeSqlForAnonymousConstraints(sql, source, resolved);
    return detectAnonymousConstraints(tokens, source);
}

function positiveLimit(value: number | undefined, fallback: number, name: string): number {
    const resolved = value ?? fallback;
    if (!Number.isSafeInteger(resolved) || resolved < 1) {
        throw new IntegrationRuntimeError(`Anonymous constraint lint ${name} must be a positive safe integer`);
    }
    return resolved;
}
