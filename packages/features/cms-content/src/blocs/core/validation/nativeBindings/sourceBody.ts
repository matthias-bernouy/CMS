import { parseQueryInput, parseSourceBody } from "cms-content/blocs/core/markup/bindings";

const TYPED_PATH = /^[A-Za-z0-9_-]+(?:\[[A-Za-z0-9_-]+\])*$/;

export function isTypedSourceBody(value: string): boolean {
    return parseSourceBody(value) !== null;
}

export function isTypedQueryInput(value: string): boolean {
    const input = parseQueryInput(value);
    return input !== null && Object.keys(input).every((name) => TYPED_PATH.test(name));
}
