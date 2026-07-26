import type { AnonymousConstraintFinding } from "../anonymousConstraintLint";
import { alterTableStatement, createTableBody, isName, isSymbol, isWord, nextTopLevelComma } from "./statements";
import type { SqlLintToken } from "./tokenizer";

export function detectAnonymousConstraints(tokens: SqlLintToken[], path: string): AnonymousConstraintFinding[] {
    const findings: AnonymousConstraintFinding[] = [];
    for (let index = 0; index < tokens.length; index += 1) {
        if (isWord(tokens[index], "CREATE")) {
            const body = createTableBody(tokens, index);
            if (body) {
                scanConstraintRange(tokens, body.start, body.end, path, findings);
                index = body.end;
            }
        } else if (isWord(tokens[index], "ALTER")) {
            const statement = alterTableStatement(tokens, index);
            if (statement) {
                scanAlterActions(tokens, statement.start, statement.end, path, findings);
                index = statement.end;
            }
        }
    }
    return findings;
}

function scanAlterActions(
    tokens: SqlLintToken[],
    start: number,
    end: number,
    path: string,
    findings: AnonymousConstraintFinding[],
): void {
    let actionStart = start;
    while (actionStart < end) {
        while (isSymbol(tokens[actionStart], ",")) {
            actionStart += 1;
        }
        const actionEnd = nextTopLevelComma(tokens, actionStart, end);
        if (isWord(tokens[actionStart], "ADD")) {
            scanConstraintRange(tokens, actionStart + 1, actionEnd, path, findings);
        }
        actionStart = actionEnd + 1;
    }
}

function scanConstraintRange(
    tokens: SqlLintToken[],
    start: number,
    end: number,
    path: string,
    findings: AnonymousConstraintFinding[],
): void {
    let depth = 0;
    let clause: SqlLintToken[] = [];
    for (let index = start; index < end; index += 1) {
        const token = tokens[index]!;
        if (isSymbol(token, "(")) {
            depth += 1;
            continue;
        }
        if (isSymbol(token, ")")) {
            depth -= 1;
            continue;
        }
        if (depth !== 0) {
            continue;
        }
        if (isSymbol(token, ",")) {
            clause = [];
            continue;
        }
        if ((isWord(token, "CHECK") || isWord(token, "UNIQUE")) && !hasNamedConstraintPrefix(clause)) {
            findings.push({
                path,
                line: token.line,
                column: token.column,
                kind: token.value === "CHECK" ? "anonymous-check" : "anonymous-unique",
            });
        }
        clause.push(token);
    }
}

function hasNamedConstraintPrefix(clause: SqlLintToken[]): boolean {
    return isName(clause.at(-1)) && isWord(clause.at(-2), "CONSTRAINT");
}
