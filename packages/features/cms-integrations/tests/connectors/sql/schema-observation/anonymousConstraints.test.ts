import { describe, expect, test } from "bun:test";
import { lintAnonymousConstraints } from "cms-integrations/default-implementation/supabase/sql/anonymousConstraintLint";
import { anonymousConstraintPatterns } from "../anonymousConstraintPatterns";

describe("anonymous PostgreSQL constraint lint", () => {
    test("keeps the representative matrix at 26 patterns", () => {
        expect(anonymousConstraintPatterns).toHaveLength(26);
    });

    test.each(anonymousConstraintPatterns)("$label", ({ sql, kinds, locations }) => {
        const findings = lintAnonymousConstraints(sql, "sql/schema.sql");

        expect(findings.map(({ kind }) => kind)).toEqual(kinds);
        expect(findings.every(({ path }) => path === "sql/schema.sql")).toBeTrue();
        if (locations) {
            expect(findings.map(({ line, column }) => ({ line, column }))).toEqual(locations);
        }
    });

    test.each([
        ["string literal", "SELECT 'unterminated", /unterminated string literal/],
        ["quoted identifier", 'CREATE TABLE "unterminated (id integer);', /unterminated quoted identifier/],
        ["dollar quote", "DO $tag$ SELECT 1;", /unterminated dollar-quoted string/],
        ["block comment", "SELECT /* unterminated", /unterminated block comment/],
        ["opening parenthesis", "CREATE TABLE accounts (id integer", /unterminated parenthesized expression/],
        ["closing parenthesis", "SELECT 1)", /unexpected closing parenthesis/],
    ])("fails closed on unterminated or unbalanced %s", (_label, sql, error) => {
        expect(() => lintAnonymousConstraints(sql, "sql/broken.sql")).toThrow(error as RegExp);
    });

    test("enforces byte, token, and nesting limits", () => {
        expect(() => lintAnonymousConstraints("ééé", "sql/large.sql", { maxBytes: 5 })).toThrow(/exceeds 5 bytes/);
        expect(() => lintAnonymousConstraints("SELECT one two three", "sql/tokens.sql", { maxTokens: 3 })).toThrow(
            /token count exceeds 3/,
        );
        expect(() => lintAnonymousConstraints("SELECT (((1)))", "sql/deep.sql", { maxDepth: 2 })).toThrow(
            /nesting exceeds 2/,
        );
    });

    test("rejects invalid limits and missing paths", () => {
        expect(() => lintAnonymousConstraints("SELECT 1", "sql/schema.sql", { maxTokens: 0 })).toThrow(
            /maxTokens must be a positive safe integer/,
        );
        expect(() => lintAnonymousConstraints("SELECT 1", "   ")).toThrow(/requires a source path/);
    });
});
