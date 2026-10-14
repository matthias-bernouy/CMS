type ExpressionLiteral = string | number | boolean | null;
export type ExpressionOperator = "!" | "&&" | "||" | "===" | "!==" | ">" | ">=" | "<" | "<=";
export type ExpressionCompareOperator = Exclude<ExpressionOperator, "!" | "&&" | "||">;

export type ExpressionToken =
    | { kind: "operator"; value: ExpressionOperator }
    | { kind: "punctuation"; value: "|" | "(" | ")" }
    | { kind: "path"; value: string }
    | { kind: "literal"; value: ExpressionLiteral }
    | { kind: "end" };

export type ExpressionNode =
    | { kind: "literal"; value: ExpressionLiteral }
    | { kind: "path"; path: string }
    | { kind: "filter"; path: string; name: string; argument?: string }
    | { kind: "not"; node: ExpressionNode }
    | { kind: "and" | "or"; left: ExpressionNode; right: ExpressionNode }
    | {
          kind: "compare";
          operator: ExpressionCompareOperator;
          left: ExpressionNode;
          right: ExpressionNode;
      };

export type ExpressionValueType = "boolean" | "string" | "number" | "null" | "unknown";
