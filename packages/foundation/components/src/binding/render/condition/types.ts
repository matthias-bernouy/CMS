import type { Scope } from "../../scope";

export type LiteralValue = string | number | boolean | null;
export type Operator = "!" | "&&" | "||" | "==" | "!=" | ">" | ">=" | "<" | "<=";
export type CompareOperator = "==" | "!=" | ">" | ">=" | "<" | "<=";

export type Token =
    | { kind: "operator"; value: Operator }
    | { kind: "path"; value: string }
    | { kind: "literal"; value: LiteralValue }
    | { kind: "end" };

export type ConditionNode =
    | { kind: "literal"; value: LiteralValue }
    | { kind: "path"; path: string }
    | { kind: "not"; node: ConditionNode }
    | { kind: "and" | "or"; left: ConditionNode; right: ConditionNode }
    | { kind: "compare"; operator: CompareOperator; left: ConditionNode; right: ConditionNode };

export type CompiledCondition = {
    expression: string;
    valid: boolean;
    evaluate(scope: Scope): boolean;
};
