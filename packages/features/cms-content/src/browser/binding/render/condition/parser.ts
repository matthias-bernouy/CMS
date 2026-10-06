import { tokenize } from "./tokenizer";
import type { CompareOperator, ConditionNode, Operator, Token } from "./types";

export function parseConditionExpression(expression: string): ConditionNode {
    return new Parser(tokenize(expression)).parse();
}

class Parser {
    private index = 0;

    constructor(private readonly tokens: Token[]) {}

    parse(): ConditionNode {
        const root = this.parseOr();
        if (this.peek().kind !== "end") {
            throw new Error("unexpected trailing tokens");
        }
        return root;
    }

    private parseOr(): ConditionNode {
        let node = this.parseAnd();
        while (this.match("||")) {
            node = { kind: "or", left: node, right: this.parseAnd() };
        }
        return node;
    }

    private parseAnd(): ConditionNode {
        let node = this.parseComparison();
        while (this.match("&&")) {
            node = { kind: "and", left: node, right: this.parseComparison() };
        }
        return node;
    }

    private parseComparison(): ConditionNode {
        const left = this.parseUnary();
        const operator = this.comparisonOperator();
        if (!operator) {
            return left;
        }
        this.index += 1;
        return { kind: "compare", operator, left, right: this.parseUnary() };
    }

    private parseUnary(): ConditionNode {
        if (this.match("!")) {
            return { kind: "not", node: this.parseUnary() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): ConditionNode {
        const token = this.next();
        if (token.kind === "literal") {
            return { kind: "literal", value: token.value };
        }
        if (token.kind === "path") {
            return this.parsePath(token.value);
        }
        if (token.kind === "end") {
            throw new Error("unexpected end of expression");
        }
        throw new Error(`unexpected operator "${token.value}"`);
    }

    private parsePath(path: string): ConditionNode {
        if (!this.punctuation("|")) {
            return { kind: "path", path };
        }
        const filter = this.next();
        if (filter.kind !== "path" || !/^\w+$/.test(filter.value)) {
            throw new Error("expected a registered filter name");
        }
        if (!this.punctuation("(")) {
            return { kind: "filter", path, name: filter.value };
        }
        const argument = this.next();
        if (argument.kind !== "path" || !this.punctuation(")")) {
            throw new Error("expected one filter argument path");
        }
        return { kind: "filter", path, name: filter.value, argument: argument.value };
    }

    private punctuation(value: "|" | "(" | ")"): boolean {
        const token = this.peek();
        if (token.kind !== "punctuation" || token.value !== value) {
            return false;
        }
        this.index += 1;
        return true;
    }

    private match(operator: Operator): boolean {
        const token = this.peek();
        if (token.kind !== "operator" || token.value !== operator) {
            return false;
        }
        this.index += 1;
        return true;
    }

    private comparisonOperator(): CompareOperator | null {
        const token = this.peek();
        if (token.kind !== "operator") {
            return null;
        }
        if (
            token.value === "==" ||
            token.value === "!=" ||
            token.value === ">" ||
            token.value === ">=" ||
            token.value === "<" ||
            token.value === "<="
        ) {
            return token.value;
        }
        return null;
    }

    private peek(): Token {
        return this.tokens[this.index] ?? { kind: "end" };
    }

    private next(): Token {
        const token = this.peek();
        this.index += 1;
        return token;
    }
}
