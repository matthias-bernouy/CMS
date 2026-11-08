import type { Scope } from "../../core/scope";

export type CompiledCondition = {
    expression: string;
    valid: boolean;
    evaluate(scope: Scope): boolean;
};
