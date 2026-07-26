import { IntegrationInputError } from "../../../errors";
import { text } from "../values";

const UNSAFE_CSS_VALUE = /[;{}\u0000-\u001f\u007f]|\/\*|\*\/|!\s*important/i;
const CSS_VARIABLE_NAME = /^\s*(--[a-z][a-z0-9-]*)\s*([,)])/;
const IDENTIFIER_CHARACTER = /[a-z0-9_-]/i;

export function parseThemeCssValue(value: unknown, name: string): string {
    const parsed = text(value);
    if (!parsed) {
        throw new IntegrationInputError(name, "must be a non-empty string");
    }
    if (UNSAFE_CSS_VALUE.test(parsed)) {
        throw new IntegrationInputError(name, "must be a safe CSS value without declaration escapes or !important");
    }
    assertCssSyntaxBoundaries(parsed, name);
    return parsed;
}

function assertCssSyntaxBoundaries(value: string, name: string): void {
    const stack: string[] = [];
    let quote: "'" | '"' | undefined;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index]!;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (character === "\\") {
            escaped = true;
            continue;
        }
        if (quote) {
            if (character === quote) {
                quote = undefined;
            }
            continue;
        }
        if (character === "'" || character === '"') {
            quote = character;
            continue;
        }
        if (startsVariableFunction(value, index)) {
            assertVariableReference(value.slice(index + 4), name);
        }
        if (character === "(" || character === "[") {
            stack.push(character);
        } else if (character === ")" || character === "]") {
            const expected = character === ")" ? "(" : "[";
            if (stack.pop() !== expected) {
                throw new IntegrationInputError(name, "must be a balanced CSS value");
            }
        }
    }
    if (escaped || quote || stack.length > 0) {
        throw new IntegrationInputError(name, "must be a balanced CSS value");
    }
}

function startsVariableFunction(value: string, index: number): boolean {
    const previous = value[index - 1];
    return (
        (!previous || !IDENTIFIER_CHARACTER.test(previous)) && value.slice(index, index + 4).toLowerCase() === "var("
    );
}

function assertVariableReference(value: string, name: string): void {
    if (!CSS_VARIABLE_NAME.test(value)) {
        throw new IntegrationInputError(name, "must reference CSS variables as var(--token-name)");
    }
}
