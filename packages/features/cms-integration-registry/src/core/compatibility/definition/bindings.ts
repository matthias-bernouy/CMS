import { integrationVersionRangeContainsRange, type IntegrationDefinition } from "@bernouy/cms-integrations";
import type { CompatibilityChangeSink } from "../changes";

export function compareDefinitionBindings(
    baseline: IntegrationDefinition,
    candidate: IntegrationDefinition,
    add: CompatibilityChangeSink,
): void {
    compareInputs(baseline, candidate, add);
    compareDependencies(baseline, candidate, add);
}

function compareInputs(
    baseline: IntegrationDefinition,
    candidate: IntegrationDefinition,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map(baseline.inputs.map((input) => [input.name, input]));
    const next = new Map(candidate.inputs.map((input) => [input.name, input]));
    for (const [name, input] of previous) {
        const candidateInput = next.get(name);
        const path = `inputs.${name}`;
        if (!candidateInput) {
            add("breaking", "input", "input-removed", path, "Integration input was removed or renamed");
        } else if (
            input.type !== candidateInput.type ||
            (!input.required && candidateInput.required) ||
            (!input.secret && candidateInput.secret) ||
            optionsNarrowed(input.options, candidateInput.options)
        ) {
            add("breaking", "input", "input-narrowed", path, "Integration input became more restrictive");
        }
    }
    for (const [name, input] of next) {
        if (!previous.has(name)) {
            add(
                input.required ? "breaking" : "additive",
                "input",
                input.required ? "required-input-added" : "optional-input-added",
                `inputs.${name}`,
                input.required ? "New required integration input was added" : "Optional integration input was added",
            );
        }
    }
}

function compareDependencies(
    baseline: IntegrationDefinition,
    candidate: IntegrationDefinition,
    add: CompatibilityChangeSink,
): void {
    const previous = new Map((baseline.dependencies ?? []).map((dependency) => [dependency.name, dependency]));
    const next = new Map((candidate.dependencies ?? []).map((dependency) => [dependency.name, dependency]));
    for (const [name, dependency] of previous) {
        const candidateDependency = next.get(name);
        const path = `dependencies.${name}`;
        if (!candidateDependency) {
            add("breaking", "dependency", "dependency-removed", path, "Dependency binding was removed or renamed");
            continue;
        }
        if (dependency.kind !== candidateDependency.kind || (dependency.optional && !candidateDependency.optional)) {
            add(
                "breaking",
                "dependency",
                "dependency-binding-narrowed",
                path,
                "Dependency binding became more restrictive",
            );
        }
        compareDependencyRange(dependency.versionRange, candidateDependency.versionRange, path, add);
    }
    for (const [name, dependency] of next) {
        if (!previous.has(name)) {
            add(
                dependency.optional ? "additive" : "breaking",
                "dependency",
                dependency.optional ? "optional-dependency-added" : "required-dependency-added",
                `dependencies.${name}`,
                dependency.optional ? "Optional dependency was added" : "Required dependency was added",
            );
        }
    }
}

function compareDependencyRange(
    baseline: string | undefined,
    candidate: string | undefined,
    path: string,
    add: CompatibilityChangeSink,
): void {
    if (baseline === candidate) {
        return;
    }
    if (!candidate || (baseline && integrationVersionRangeContainsRange(candidate, baseline))) {
        add(
            "additive",
            "dependency",
            "dependency-range-widened",
            `${path}.versionRange`,
            "Dependency range was widened",
        );
    } else {
        add(
            "breaking",
            "dependency",
            "dependency-range-narrowed",
            `${path}.versionRange`,
            "Dependency range excludes previously supported versions",
        );
    }
}

function optionsNarrowed(
    baseline: ReadonlyArray<{ value: string }> | undefined,
    candidate: ReadonlyArray<{ value: string }> | undefined,
): boolean {
    if (!baseline) {
        return candidate !== undefined;
    }
    return Boolean(candidate && baseline.some((option) => !candidate.some((entry) => entry.value === option.value)));
}
