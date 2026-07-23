import type { DeclarativeAfterInstallationTemplate, IntegrationDependency } from "../../../interfaces/Integration";
import { IntegrationInputError, MissingIntegrationParam } from "../../errors";
import { isRecord, text } from "./values";

export function parseAfterInstallationTemplates(value: unknown): DeclarativeAfterInstallationTemplate[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError("definition.afterInstallation", "must be an array");
    }
    return value.map((entry, index) => parseTemplate(entry, `definition.afterInstallation.${index}`));
}

export function validateAfterInstallationTemplates(
    templates: DeclarativeAfterInstallationTemplate[],
    dependencies: IntegrationDependency[],
): void {
    const dependencyNames = new Set(dependencies.map((dependency) => dependency.name));
    const ids = new Set<string>();
    for (const template of templates) {
        if (!/^[A-Za-z0-9][A-Za-z0-9_-]*$/.test(template.id)) {
            throw new IntegrationInputError("definition.afterInstallation.id", "must be a simple id");
        }
        if (ids.has(template.id)) {
            throw new IntegrationInputError("definition.afterInstallation.id", `duplicate id "${template.id}"`);
        }
        ids.add(template.id);
        for (const requirement of template.requires ?? []) {
            if (!dependencyNames.has(requirement)) {
                throw new IntegrationInputError(
                    `definition.afterInstallation.${template.id}.requires`,
                    `unknown dependency "${requirement}"`,
                );
            }
        }
    }
}

function parseTemplate(value: unknown, name: string): DeclarativeAfterInstallationTemplate {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const id = text(value.id);
    if (!id) {
        throw new MissingIntegrationParam(`${name}.id`);
    }
    if (!Array.isArray(value.steps)) {
        throw new IntegrationInputError(`${name}.steps`, "must be an array");
    }
    const requires = parseRequirements(value.requires, `${name}.requires`);
    return {
        id,
        ...(requires.length ? { requires } : {}),
        steps: value.steps as DeclarativeAfterInstallationTemplate["steps"],
    };
}

function parseRequirements(value: unknown, name: string): string[] {
    if (value === undefined || value === null) {
        return [];
    }
    if (!Array.isArray(value)) {
        throw new IntegrationInputError(name, "must be an array");
    }
    const requirements = value.map((entry, index) => {
        const requirement = text(entry);
        if (!requirement) {
            throw new IntegrationInputError(`${name}.${index}`, "must be a dependency name");
        }
        return requirement;
    });
    if (new Set(requirements).size !== requirements.length) {
        throw new IntegrationInputError(name, "must not contain duplicates");
    }
    return requirements;
}
