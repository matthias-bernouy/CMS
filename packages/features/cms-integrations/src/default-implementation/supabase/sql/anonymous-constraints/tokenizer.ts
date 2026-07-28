import { isSqlIdentifierPart, isSqlIdentifierStart, type SqlSourcePosition, SqlCursor } from "./cursor";
import { skipComment, skipStringLiteral, skipWhitespace } from "./ignoredSyntax";

export type SqlLintToken = {
    kind: "word" | "identifier" | "symbol" | "atom";
    value: string;
    line: number;
    column: number;
};

type TokenizeOptions = {
    maxTokens: number;
    maxDepth: number;
};

export function tokenizeSqlForAnonymousConstraints(
    sql: string,
    path: string,
    options: TokenizeOptions,
): SqlLintToken[] {
    const cursor = new SqlCursor(sql, path);
    const tokens: SqlLintToken[] = [];
    const parentheses: SqlSourcePosition[] = [];
    const push = (token: SqlLintToken) => {
        tokens.push(token);
        if (tokens.length > options.maxTokens) {
            cursor.fail(`token count exceeds ${options.maxTokens}`, token);
        }
    };

    while (!cursor.done()) {
        if (skipWhitespace(cursor) || skipComment(cursor, options.maxDepth) || skipStringLiteral(cursor)) {
            continue;
        }
        const position = cursor.position();
        const current = cursor.current();
        if (isUnicodeQuotedIdentifier(cursor)) {
            cursor.advanceMany(2);
            readQuotedIdentifier(cursor, position, push);
        } else if (isSqlIdentifierStart(current)) {
            readWord(cursor, position, push);
        } else if (current === '"') {
            readQuotedIdentifier(cursor, position, push);
        } else if (current === "(" || current === ")") {
            readParenthesis(cursor, current, position, parentheses, options.maxDepth, push);
        } else {
            cursor.advance();
            push({ kind: symbolKind(current), value: current, ...position });
        }
    }
    const unclosed = parentheses.at(-1);
    if (unclosed) {
        cursor.fail("unterminated parenthesized expression", unclosed);
    }
    return tokens;
}

function readWord(cursor: SqlCursor, position: SqlSourcePosition, push: (token: SqlLintToken) => void): void {
    const start = cursor.offset;
    cursor.advance();
    while (!cursor.done() && isSqlIdentifierPart(cursor.current())) {
        cursor.advance();
    }
    push({ kind: "word", value: cursor.slice(start, cursor.offset).toUpperCase(), ...position });
}

function readQuotedIdentifier(
    cursor: SqlCursor,
    position: SqlSourcePosition,
    push: (token: SqlLintToken) => void,
): void {
    cursor.advance();
    while (!cursor.done()) {
        if (cursor.current() === '"' && cursor.current(1) === '"') {
            cursor.advanceMany(2);
        } else if (cursor.current() === '"') {
            cursor.advance();
            push({ kind: "identifier", value: "", ...position });
            return;
        } else {
            cursor.advance();
        }
    }
    cursor.fail("unterminated quoted identifier", position);
}

function readParenthesis(
    cursor: SqlCursor,
    value: "(" | ")",
    position: SqlSourcePosition,
    parentheses: SqlSourcePosition[],
    maxDepth: number,
    push: (token: SqlLintToken) => void,
): void {
    if (value === "(") {
        parentheses.push(position);
        if (parentheses.length > maxDepth) {
            cursor.fail(`nesting exceeds ${maxDepth}`, position);
        }
    } else if (!parentheses.pop()) {
        cursor.fail("unexpected closing parenthesis", position);
    }
    cursor.advance();
    push({ kind: "symbol", value, ...position });
}

function isUnicodeQuotedIdentifier(cursor: SqlCursor): boolean {
    return cursor.current().toUpperCase() === "U" && cursor.current(1) === "&" && cursor.current(2) === '"';
}

function symbolKind(value: string): SqlLintToken["kind"] {
    return ",;.*".includes(value) ? "symbol" : "atom";
}
