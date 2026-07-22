import { randomBytes } from "node:crypto";
import { secretKeyError } from "@bernouy/cms-secrets";
import { IntegrationInputError } from "../../errors";
import { assertPasswordInputsDeclareSecrets, sensitiveInputNames } from "../../shared/inputSensitivity";
import { resolveTemplate, type TemplateContext } from "../../definitions/templates";
import type {
    DeclarativeGeneratedSecretTemplate,
    DeclarativeSecretTemplate,
    IntegrationDefinition,
} from "../../../interfaces/Integration";

export type DeclarativeSecretWrite = { input: string; key: string; value: string };

export function resolveSecretRefs(
    definition: IntegrationDefinition,
    answers: TemplateContext["answers"],
): Record<string, string> {
    const secretInputNames = sensitiveInputs(definition);
    const inputSecrets = buildInputSecretWrites(definition.secrets ?? [], answers, secretInputNames);
    const generatedSecrets = buildGeneratedSecretWrites(definition.generatedSecrets ?? [], answers, false);
    const writes = [...inputSecrets, ...generatedSecrets];
    assertUniqueSecretWrites(writes);
    return Object.fromEntries(writes.map((secret) => [secret.input, secret.key]));
}

export function declarativeSecretBindingNames(definition: IntegrationDefinition): string[] {
    return [...sensitiveInputNames(definition), ...(definition.generatedSecrets ?? []).map((secret) => secret.name)];
}

export function sensitiveInputs(definition: IntegrationDefinition): Set<string> {
    assertPasswordInputsDeclareSecrets(definition);
    return new Set(sensitiveInputNames(definition));
}

export function buildInputSecretWrites(
    templates: DeclarativeSecretTemplate[],
    answers: TemplateContext["answers"],
    secretInputNames: ReadonlySet<string>,
): DeclarativeSecretWrite[] {
    const seenKeys = new Map<string, string>();
    return templates.map((template) => {
        if (!secretInputNames.has(template.input)) {
            throw new IntegrationInputError(`secrets.${template.input}`, "must reference a secret input");
        }
        const rawValue = answers[template.input];
        if (typeof rawValue !== "string" || !rawValue) {
            throw new IntegrationInputError(`answers.${template.input}`, "must be a non-empty string secret");
        }
        const key = resolveTemplate(template.key, { answers, secrets: {}, secretInputs: secretInputNames });
        const keyError = secretKeyError(key);
        if (keyError) {
            throw new IntegrationInputError(`secrets.${template.input}.key`, keyError);
        }
        const previousInput = seenKeys.get(key);
        if (previousInput && previousInput !== template.input) {
            throw new IntegrationInputError("secrets", `duplicate resolved secret key "${key}"`);
        }
        seenKeys.set(key, template.input);
        return { input: template.input, key, value: rawValue };
    });
}

export function buildGeneratedSecretWrites(
    templates: DeclarativeGeneratedSecretTemplate[],
    answers: TemplateContext["answers"],
    generateValues: boolean,
): DeclarativeSecretWrite[] {
    const seenNames = new Set<string>();
    const seenKeys = new Set<string>();
    return templates.map((template) => {
        if (!template.name) {
            throw new IntegrationInputError("generatedSecrets.name", "is required");
        }
        if (seenNames.has(template.name)) {
            throw new IntegrationInputError("generatedSecrets", `duplicate generated secret "${template.name}"`);
        }
        seenNames.add(template.name);

        const key = resolveTemplate(template.key, { answers, secrets: {}, secretInputs: new Set() });
        const keyError = secretKeyError(key);
        if (keyError) {
            throw new IntegrationInputError(`generatedSecrets.${template.name}.key`, keyError);
        }
        if (seenKeys.has(key)) {
            throw new IntegrationInputError("generatedSecrets", `duplicate resolved secret key "${key}"`);
        }
        seenKeys.add(key);

        return {
            input: template.name,
            key,
            value: generateValues ? generateSecretValue(template) : "__generated__",
        };
    });
}

export function assertUniqueSecretWrites(writes: Array<{ input: string; key: string }>): void {
    const names = new Set<string>();
    const keys = new Set<string>();
    for (const write of writes) {
        if (names.has(write.input)) {
            throw new IntegrationInputError("secrets", `duplicate secret binding "${write.input}"`);
        }
        if (keys.has(write.key)) {
            throw new IntegrationInputError("secrets", `duplicate resolved secret key "${write.key}"`);
        }
        names.add(write.input);
        keys.add(write.key);
    }
}

function generateSecretValue(template: DeclarativeGeneratedSecretTemplate): string {
    if (template.generator !== undefined && template.generator !== "token") {
        throw new IntegrationInputError(`generatedSecrets.${template.name}.generator`, "must be token");
    }
    const bytes = template.bytes ?? 32;
    if (!Number.isInteger(bytes) || bytes < 16 || bytes > 64) {
        throw new IntegrationInputError(
            `generatedSecrets.${template.name}.bytes`,
            "must be an integer between 16 and 64",
        );
    }
    return `${template.prefix ?? ""}${randomBytes(bytes).toString("base64url")}`;
}
