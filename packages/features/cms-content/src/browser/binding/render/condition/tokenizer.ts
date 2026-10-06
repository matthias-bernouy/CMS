import type { Token } from "./types";

export function tokenize(expression: string): Token[] {
    const tokens: Token[] = [];
    let index = 0;

    while (index < expression.length) {
        const char = expression[index]!;
        if (/\s/.test(char)) {
            index += 1;
            continue;
        }

        const two = expression.slice(index, index + 2);
        if (two === "&&" || two === "||" || two === "==" || two === "!=" || two === ">=" || two === "<=") {
            tokens.push({ kind: "operator", value: two });
            index += 2;
            continue;
        }

        if (char === "!" || char === ">" || char === "<") {
            tokens.push({ kind: "operator", value: char });
            index += 1;
            continue;
        }

        if (char === "|" || char === "(" || char === ")") {
            tokens.push({ kind: "punctuation", value: char });
            index += 1;
            continue;
        }

        if (char === "'" || char === '"') {
            const parsed = readString(expression, index, char);
            tokens.push({ kind: "literal", value: parsed.value });
            index = parsed.next;
            continue;
        }

        if ((char === "-" && /\d/.test(expression[index + 1] ?? "")) || /\d/.test(char)) {
            const parsed = readNumber(expression, index);
            tokens.push({ kind: "literal", value: parsed.value });
            index = parsed.next;
            continue;
        }

        const parsed = readBareToken(expression, index);
        if (parsed.value === "true") {
            tokens.push({ kind: "literal", value: true });
        } else if (parsed.value === "false") {
            tokens.push({ kind: "literal", value: false });
        } else if (parsed.value === "null") {
            tokens.push({ kind: "literal", value: null });
        } else {
            tokens.push({ kind: "path", value: parsed.value });
        }
        index = parsed.next;
    }

    tokens.push({ kind: "end" });
    return tokens;
}

function readString(expression: string, start: number, quote: string): { value: string; next: number } {
    let value = "";
    for (let index = start + 1; index < expression.length; index += 1) {
        const char = expression[index]!;
        if (char === quote) {
            return { value, next: index + 1 };
        }
        if (char === "\\") {
            const next = expression[index + 1];
            if (next == null) {
                throw new Error("unterminated string literal");
            }
            value += unescapeStringChar(next);
            index += 1;
            continue;
        }
        value += char;
    }
    throw new Error("unterminated string literal");
}

function unescapeStringChar(char: string): string {
    if (char === "n") {
        return "\n";
    }
    if (char === "r") {
        return "\r";
    }
    if (char === "t") {
        return "\t";
    }
    return char;
}

function readNumber(expression: string, start: number): { value: number; next: number } {
    let index = start;
    if (expression[index] === "-") {
        index += 1;
    }
    while (/\d/.test(expression[index] ?? "")) {
        index += 1;
    }
    if (expression[index] === ".") {
        index += 1;
        while (/\d/.test(expression[index] ?? "")) {
            index += 1;
        }
    }

    const raw = expression.slice(start, index);
    const value = Number(raw);
    if (!Number.isFinite(value)) {
        throw new Error(`invalid number literal "${raw}"`);
    }
    return { value, next: index };
}

function readBareToken(expression: string, start: number): { value: string; next: number } {
    let index = start;
    while (index < expression.length && !/\s/.test(expression[index]!) && !"!&|=<>\"'()".includes(expression[index]!)) {
        index += 1;
    }

    const value = expression.slice(start, index);
    if (!value) {
        throw new Error(`unexpected token "${expression[start] ?? ""}"`);
    }
    if (!isValidPath(value)) {
        throw new Error(`invalid path "${value}"`);
    }
    return { value, next: index };
}

function isValidPath(value: string): boolean {
    if (value === ".") {
        return true;
    }
    return /^[A-Za-z_$][\w$-]*(?:\.[\w$-]+)*$/.test(value);
}
