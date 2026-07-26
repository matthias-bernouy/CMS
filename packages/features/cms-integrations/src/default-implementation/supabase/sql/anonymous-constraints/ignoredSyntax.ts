import { isSqlIdentifierStart, type SqlSourcePosition, SqlCursor } from "./cursor";

export function skipWhitespace(cursor: SqlCursor): boolean {
    if (!/\s/u.test(cursor.current())) {
        return false;
    }
    while (!cursor.done() && /\s/u.test(cursor.current())) {
        cursor.advance();
    }
    return true;
}

export function skipComment(cursor: SqlCursor, maxDepth: number): boolean {
    if (cursor.startsWith("--")) {
        while (!cursor.done() && cursor.current() !== "\n" && cursor.current() !== "\r") {
            cursor.advance();
        }
        return true;
    }
    if (!cursor.startsWith("/*")) {
        return false;
    }
    const start = cursor.position();
    let depth = 0;
    while (!cursor.done()) {
        if (cursor.startsWith("/*")) {
            depth += 1;
            if (depth > maxDepth) {
                cursor.fail(`nesting exceeds ${maxDepth}`);
            }
            cursor.advanceMany(2);
        } else if (cursor.startsWith("*/")) {
            depth -= 1;
            cursor.advanceMany(2);
            if (depth === 0) {
                return true;
            }
        } else {
            cursor.advance();
        }
    }
    cursor.fail("unterminated block comment", start);
}

export function skipStringLiteral(cursor: SqlCursor): boolean {
    const delimiter = dollarDelimiter(cursor);
    if (delimiter) {
        readDollarQuoted(cursor, delimiter);
        return true;
    }
    if (isUnicodeString(cursor)) {
        const start = cursor.position();
        cursor.advanceMany(2);
        readSingleQuoted(cursor, false, start);
        return true;
    }
    if (isStringPrefix(cursor.current()) && cursor.current(1) === "'") {
        const start = cursor.position();
        const backslashEscapes = cursor.current().toUpperCase() === "E";
        cursor.advance();
        readSingleQuoted(cursor, backslashEscapes, start);
        return true;
    }
    if (cursor.current() !== "'") {
        return false;
    }
    readSingleQuoted(cursor, false, cursor.position());
    return true;
}

function readSingleQuoted(cursor: SqlCursor, backslashEscapes: boolean, start: SqlSourcePosition): void {
    cursor.advance();
    while (!cursor.done()) {
        if (cursor.current() === "'" && cursor.current(1) === "'") {
            cursor.advanceMany(2);
        } else if (cursor.current() === "'") {
            cursor.advance();
            return;
        } else if (backslashEscapes && cursor.current() === "\\") {
            cursor.advance();
            if (!cursor.done()) {
                cursor.advance();
            }
        } else {
            cursor.advance();
        }
    }
    cursor.fail("unterminated string literal", start);
}

function readDollarQuoted(cursor: SqlCursor, delimiter: string): void {
    const start = cursor.position();
    cursor.advanceMany(delimiter.length);
    while (!cursor.done()) {
        if (cursor.startsWith(delimiter)) {
            cursor.advanceMany(delimiter.length);
            return;
        }
        cursor.advance();
    }
    cursor.fail("unterminated dollar-quoted string", start);
}

function dollarDelimiter(cursor: SqlCursor): string | null {
    if (cursor.current() !== "$") {
        return null;
    }
    if (cursor.current(1) === "$") {
        return "$$";
    }
    let offset = cursor.offset + 1;
    if (!isSqlIdentifierStart(cursor.at(offset))) {
        return null;
    }
    offset += 1;
    while (isDollarTagPart(cursor.at(offset))) {
        offset += 1;
    }
    return cursor.at(offset) === "$" ? cursor.slice(cursor.offset, offset + 1) : null;
}

function isUnicodeString(cursor: SqlCursor): boolean {
    return cursor.current().toUpperCase() === "U" && cursor.current(1) === "&" && cursor.current(2) === "'";
}

function isDollarTagPart(value: string): boolean {
    return /[0-9]/u.test(value) || isSqlIdentifierStart(value);
}

function isStringPrefix(value: string): boolean {
    return value.length === 1 && "EeBbXxNn".includes(value);
}
