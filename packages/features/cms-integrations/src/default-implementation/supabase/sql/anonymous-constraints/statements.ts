import type { SqlLintToken } from "./tokenizer";

export type TokenRange = { start: number; end: number };

const CREATE_TABLE_MODIFIERS = new Set(["GLOBAL", "LOCAL", "TEMP", "TEMPORARY", "UNLOGGED"]);

export function createTableBody(tokens: SqlLintToken[], create: number): TokenRange | null {
    let cursor = create + 1;
    while (CREATE_TABLE_MODIFIERS.has(tokens[cursor]?.value ?? "")) {
        cursor += 1;
    }
    if (!isWord(tokens[cursor], "TABLE")) {
        return null;
    }
    cursor = skipSequence(tokens, cursor + 1, ["IF", "NOT", "EXISTS"]);
    cursor = consumeQualifiedName(tokens, cursor);
    if (cursor < 0 || !isSymbol(tokens[cursor], "(")) {
        return null;
    }
    const end = matchingParenthesis(tokens, cursor);
    return end < 0 ? null : { start: cursor + 1, end };
}

export function alterTableStatement(tokens: SqlLintToken[], alter: number): TokenRange | null {
    let cursor = alter + 1;
    if (!isWord(tokens[cursor], "TABLE")) {
        return null;
    }
    cursor = skipSequence(tokens, cursor + 1, ["IF", "EXISTS"]);
    if (isWord(tokens[cursor], "ONLY")) {
        cursor += 1;
    }
    cursor = consumeQualifiedName(tokens, cursor);
    if (cursor < 0) {
        return null;
    }
    if (isSymbol(tokens[cursor], "*")) {
        cursor += 1;
    }
    return { start: cursor, end: statementEnd(tokens, cursor) };
}

export function nextTopLevelComma(tokens: SqlLintToken[], start: number, end: number): number {
    let depth = 0;
    for (let index = start; index < end; index += 1) {
        if (isSymbol(tokens[index], "(")) {
            depth += 1;
        } else if (isSymbol(tokens[index], ")")) {
            depth -= 1;
        } else if (depth === 0 && isSymbol(tokens[index], ",")) {
            return index;
        }
    }
    return end;
}

export function isName(token: SqlLintToken | undefined): boolean {
    return token?.kind === "word" || token?.kind === "identifier";
}

export function isWord(token: SqlLintToken | undefined, value: string): boolean {
    return token?.kind === "word" && token.value === value;
}

export function isSymbol(token: SqlLintToken | undefined, value: string): boolean {
    return token?.kind === "symbol" && token.value === value;
}

function consumeQualifiedName(tokens: SqlLintToken[], start: number): number {
    if (!isName(tokens[start])) {
        return -1;
    }
    let cursor = start + 1;
    while (isSymbol(tokens[cursor], ".") && isName(tokens[cursor + 1])) {
        cursor += 2;
    }
    return cursor;
}

function skipSequence(tokens: SqlLintToken[], start: number, sequence: string[]): number {
    return sequence.every((word, offset) => isWord(tokens[start + offset], word)) ? start + sequence.length : start;
}

function matchingParenthesis(tokens: SqlLintToken[], open: number): number {
    let depth = 0;
    for (let index = open; index < tokens.length; index += 1) {
        if (isSymbol(tokens[index], "(")) {
            depth += 1;
        } else if (isSymbol(tokens[index], ")")) {
            depth -= 1;
            if (depth === 0) {
                return index;
            }
        }
    }
    return -1;
}

function statementEnd(tokens: SqlLintToken[], start: number): number {
    let depth = 0;
    for (let index = start; index < tokens.length; index += 1) {
        if (isSymbol(tokens[index], "(")) {
            depth += 1;
        } else if (isSymbol(tokens[index], ")")) {
            depth -= 1;
        } else if (depth === 0 && isSymbol(tokens[index], ";")) {
            return index;
        }
    }
    return tokens.length;
}
