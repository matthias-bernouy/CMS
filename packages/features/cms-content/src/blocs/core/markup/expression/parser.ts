import { tokenizeExpression } from "cms-content/blocs/core/markup/expression/tokenizer";
import type {
    ExpressionCompareOperator,
    ExpressionNode,
    ExpressionOperator,
    ExpressionToken,
} from "cms-content/blocs/core/markup/expression/types";

export function parseBindingExpression(expression: string): ExpressionNode {
    return new Parser(tokenizeExpression(expression)).parse();
}

class Parser {
    private index = 0;

    constructor(private readonly tokens: ExpressionToken[]) {}

    parse(): ExpressionNode {
        const root = this.parseOr();
        if (this.peek().kind !== "end") {
            throw new Error("unexpected trailing tokens");
        }
        return root;
    }

    private parseOr(): ExpressionNode {
        let node = this.parseAnd();
        while (this.match("||")) {
            node = { kind: "or", left: node, right: this.parseAnd() };
        }
        return node;
    }

    private parseAnd(): ExpressionNode {
        let node = this.parseComparison();
        while (this.match("&&")) {
            node = { kind: "and", left: node, right: this.parseComparison() };
        }
        return node;
    }

    private parseComparison(): ExpressionNode {
        const left = this.parseUnary();
        const operator = this.comparisonOperator();
        if (!operator) {
            return left;
        }
        this.index += 1;
        return { kind: "compare", operator, left, right: this.parseUnary() };
    }

    private parseUnary(): ExpressionNode {
        if (this.match("!")) {
            return { kind: "not", node: this.parseUnary() };
        }
        return this.parsePrimary();
    }

    private parsePrimary(): ExpressionNode {
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
        throw new Error(`unexpected ${token.kind} "${token.value}"`);
    }

    private parsePath(path: string): ExpressionNode {
        if (!this.punctuation("|")) {
            return { kind: "path", path };
        }
        const filter = this.next();
        if (filter.kind !== "path" || !/^\w+$/u.test(filter.value)) {
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

    private match(operator: ExpressionOperator): boolean {
        const token = this.peek();
        if (token.kind !== "operator" || token.value !== operator) {
            return false;
        }
        this.index += 1;
        return true;
    }

    private comparisonOperator(): ExpressionCompareOperator | null {
        const token = this.peek();
        if (token.kind !== "operator") {
            return null;
        }
        return token.value === "===" ||
            token.value === "!==" ||
            token.value === ">" ||
            token.value === ">=" ||
            token.value === "<" ||
            token.value === "<="
            ? token.value
            : null;
    }

    private peek(): ExpressionToken {
        return this.tokens[this.index] ?? { kind: "end" };
    }

    private next(): ExpressionToken {
        const token = this.peek();
        this.index += 1;
        return token;
    }
}
