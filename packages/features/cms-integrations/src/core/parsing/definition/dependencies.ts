import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { isSupportedIntegrationVersionRange } from "../../definitions/versioning";
import type { IntegrationDefinition, IntegrationDependency } from "../../../interfaces/Integration";
import { isRecord, text } from "./values";

const SIMPLE_ID = /^[A-Za-z0-9][A-Za-z0-9_-]*$/;

export function parseDependencies(value: unknown, definitionKind: string): IntegrationDependency[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.dependencies", "must be an array");
    }
    const dependencies = value.map((entry, index) => parseDependency(entry, `definition.dependencies.${index}`));
    validateDependencyList(dependencies, definitionKind);
    return dependencies;
}

export function validateDependencies(definition: IntegrationDefinition): void {
    validateDependencyList(definition.dependencies ?? [], definition.kind);
}

function parseDependency(value: unknown, name: string): IntegrationDependency {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const dependencyName = text(value.name);
    if (!dependencyName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    if (!SIMPLE_ID.test(dependencyName)) {
        throw new IntegrationInputError(`${name}.name`, "must be a simple id");
    }
    const kind = text(value.kind);
    if (!kind) {
        throw new MissingIntegrationParam(`${name}.kind`);
    }
    const versionRange = text(value.versionRange);
    if (value.versionRange !== undefined && !versionRange) {
        throw new IntegrationInputError(`${name}.versionRange`, "must be a non-empty string");
    }
    if (versionRange && !isSupportedIntegrationVersionRange(versionRange)) {
        throw new IntegrationInputError(
            `${name}.versionRange`,
            "must be an exact, caret, tilde, or bounded comparator range such as >=1.2.0 <2.0.0",
        );
    }
    return {
        name: dependencyName,
        kind,
        ...(versionRange ? { versionRange } : {}),
        ...(value.optional === true ? { optional: true } : {}),
    };
}

function validateDependencyList(dependencies: readonly IntegrationDependency[], definitionKind: string): void {
    const names = new Set<string>();
    for (const dependency of dependencies) {
        if (!SIMPLE_ID.test(dependency.name)) {
            throw new IntegrationInputError(`definition.dependencies.${dependency.name}.name`, "must be a simple id");
        }
        if (!dependency.kind) {
            throw new IntegrationInputError(`definition.dependencies.${dependency.name}.kind`, "is required");
        }
        if (
            dependency.versionRange !== undefined &&
            (typeof dependency.versionRange !== "string" ||
                dependency.versionRange.trim() !== dependency.versionRange ||
                !isSupportedIntegrationVersionRange(dependency.versionRange))
        ) {
            throw new IntegrationInputError(
                `definition.dependencies.${dependency.name}.versionRange`,
                "must be an exact, caret, tilde, or bounded comparator range such as >=1.2.0 <2.0.0",
            );
        }
        if (dependency.kind === definitionKind) {
            throw new IntegrationInputError(
                `definition.dependencies.${dependency.name}.kind`,
                "must not reference the integration itself",
            );
        }
        if (names.has(dependency.name)) {
            throw new IntegrationInputError(`definition.dependencies.${dependency.name}`, "duplicate dependency name");
        }
        names.add(dependency.name);
    }
}
