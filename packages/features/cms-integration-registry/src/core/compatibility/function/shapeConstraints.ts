import type { DeclarativeConnectorFunctionHttpDataShape } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

type DataShape = DeclarativeConnectorFunctionHttpDataShape;

export function compareResponseShapeConstraints(
    baseline: DataShape,
    candidate: DataShape,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.type !== candidate.type) {
        return;
    }
    if (baseline.type === "string" && candidate.type === "string") {
        compareEnum(baseline.enum, candidate.enum, path, add);
        compareNamedConstraint(baseline.format, candidate.format, "format", path, add);
        comparePattern(baseline.pattern, candidate.pattern, path, add);
        compareLowerBound(baseline.minLength, candidate.minLength, "min-length", path, add);
        compareUpperBound(baseline.maxLength, candidate.maxLength, "max-length", path, add);
    } else if (baseline.type === "number" && candidate.type === "number") {
        compareEnum(baseline.enum, candidate.enum, path, add);
        compareLowerBound(baseline.minimum, candidate.minimum, "minimum", path, add);
        compareUpperBound(baseline.maximum, candidate.maximum, "maximum", path, add);
    } else if (baseline.type === "boolean" && candidate.type === "boolean") {
        compareEnum(baseline.enum, candidate.enum, path, add);
    } else if (baseline.type === "array" && candidate.type === "array") {
        compareLowerBound(baseline.minItems, candidate.minItems, "min-items", path, add);
        compareUpperBound(baseline.maxItems, candidate.maxItems, "max-items", path, add);
    }
}

function compareEnum<T extends string | number | boolean>(
    baseline: readonly T[] | undefined,
    candidate: readonly T[] | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!baseline && !candidate) {
        return;
    }
    if (!candidate) {
        add("breaking", "function", "response-enum-widened", `${path}.enum`, "Response may contain new values");
        return;
    }
    if (!baseline) {
        add("additive", "function", "response-enum-declared", `${path}.enum`, "Response values are now bounded");
        return;
    }
    const previous = new Set(baseline);
    if (candidate.some((value) => !previous.has(value))) {
        add("breaking", "function", "response-enum-widened", `${path}.enum`, "Response may contain new values");
    } else if (candidate.length < baseline.length) {
        add("additive", "function", "response-enum-narrowed", `${path}.enum`, "Response values were narrowed");
    }
}

function compareNamedConstraint(
    baseline: string | undefined,
    candidate: string | undefined,
    name: string,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline === candidate) {
        return;
    }
    const constraintPath = `${path}.${name}`;
    if (!baseline) {
        add("additive", "function", `response-${name}-declared`, constraintPath, `Response ${name} is now declared`);
    } else if (!candidate) {
        add("breaking", "function", `response-${name}-removed`, constraintPath, `Response ${name} was removed`);
    } else {
        add("unknown", "function", `response-${name}-changed`, constraintPath, `Response ${name} changed`);
    }
}

function comparePattern(
    baseline: string | undefined,
    candidate: string | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareNamedConstraint(baseline, candidate, "pattern", path, add);
}

function compareLowerBound(
    baseline: number | undefined,
    candidate: number | undefined,
    name: string,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareBound(baseline, candidate, name, path, add, (next, previous) => next > previous);
}

function compareUpperBound(
    baseline: number | undefined,
    candidate: number | undefined,
    name: string,
    path: string,
    add: CompatibilityChangeSink,
): void {
    compareBound(baseline, candidate, name, path, add, (next, previous) => next < previous);
}

function compareBound(
    baseline: number | undefined,
    candidate: number | undefined,
    name: string,
    path: string,
    add: CompatibilityChangeSink,
    strengthens: (candidate: number, baseline: number) => boolean,
): void {
    if (baseline === candidate) {
        return;
    }
    const stronger = candidate !== undefined && (baseline === undefined || strengthens(candidate, baseline));
    add(
        stronger ? "additive" : "breaking",
        "function",
        `response-${name}-${stronger ? "strengthened" : "weakened"}`,
        `${path}.${name}`,
        `Response ${name} constraint was ${stronger ? "strengthened" : "weakened"}`,
    );
}
