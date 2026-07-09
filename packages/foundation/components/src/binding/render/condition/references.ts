import { tokenize } from "./tokenizer";

export function collectConditionReferences(expression: string): string[] {
    const refs: string[] = [];
    try {
        for (const token of tokenize(expression)) {
            if (token.kind === "path") refs.push(token.value);
        }
    } catch {
        const fallback = /[A-Za-z_$][\w$]*(?:\.[\w$-]+)*/g;
        for (const match of expression.matchAll(fallback)) refs.push(match[0]);
    }
    return refs;
}
