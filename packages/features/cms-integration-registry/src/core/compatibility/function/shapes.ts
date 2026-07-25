import { isDeepStrictEqual } from "node:util";
import type { DeclarativeConnectorFunctionHttpResponseContract } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

type DataShape = NonNullable<DeclarativeConnectorFunctionHttpResponseContract["body"]>;

export function compareResponseShape(
    baseline: DataShape | undefined,
    candidate: DataShape | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (!baseline && !candidate) {
        return;
    }
    if (!baseline) {
        add("additive", "function", "response-body-added", path, "Response body was added");
        return;
    }
    if (!candidate) {
        add("breaking", "function", "response-body-removed", path, "Response body was removed");
        return;
    }
    compareShapeNode(baseline, candidate, path, add);
}

function compareShapeNode(baseline: DataShape, candidate: DataShape, path: string, add: CompatibilityChangeSink): void {
    if (baseline.type !== candidate.type) {
        add(
            "breaking",
            "function",
            "response-type-changed",
            path,
            `Response type changed from ${baseline.type} to ${candidate.type}`,
        );
        return;
    }
    if (baseline.nullable && !candidate.nullable) {
        add("additive", "function", "response-nullability-strengthened", path, "Response value is no longer nullable");
    } else if (!baseline.nullable && candidate.nullable) {
        add("breaking", "function", "response-nullability-weakened", path, "Response value may now be null");
    }
    if (!isDeepStrictEqual(baseline.semantic, candidate.semantic)) {
        add("breaking", "function", "response-semantic-changed", path, "Response field semantic changed");
    }
    if (baseline.type === "object") {
        compareProperties(baseline, candidate, path, add);
    }
    if (baseline.type === "array") {
        compareArrayItems(baseline, candidate, path, add);
    }
}

function compareProperties(
    baseline: DataShape,
    candidate: DataShape,
    path: string,
    add: CompatibilityChangeSink,
): void {
    const previous = baseline.properties ?? {};
    const next = candidate.properties ?? {};
    const previousRequired = new Set(baseline.required ?? []);
    const nextRequired = new Set(candidate.required ?? []);
    for (const [name, shape] of Object.entries(previous)) {
        const candidateShape = next[name];
        const propertyPath = `${path}.properties.${name}`;
        if (!candidateShape) {
            add(
                "breaking",
                "function",
                "response-property-removed",
                propertyPath,
                "Response property was removed or renamed",
            );
            continue;
        }
        if (!previousRequired.has(name) && nextRequired.has(name)) {
            add(
                "additive",
                "function",
                "response-property-guaranteed",
                propertyPath,
                "Response property is now guaranteed",
            );
        } else if (previousRequired.has(name) && !nextRequired.has(name)) {
            add(
                "breaking",
                "function",
                "response-property-optional",
                propertyPath,
                "Guaranteed response property became optional",
            );
        }
        compareShapeNode(shape, candidateShape, propertyPath, add);
    }
    for (const [name] of Object.entries(next)) {
        if (Object.hasOwn(previous, name)) {
            continue;
        }
        add(
            "additive",
            "function",
            "response-property-added",
            `${path}.properties.${name}`,
            "Response property was added",
        );
    }
}

function compareArrayItems(
    baseline: DataShape,
    candidate: DataShape,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline.items && candidate.items) {
        compareShapeNode(baseline.items, candidate.items, `${path}.items`, add);
    } else if (baseline.items && !candidate.items) {
        add("breaking", "function", "response-items-removed", `${path}.items`, "Array item shape was removed");
    } else if (!baseline.items && candidate.items) {
        add("additive", "function", "response-items-declared", `${path}.items`, "Array item shape is now guaranteed");
    }
}
