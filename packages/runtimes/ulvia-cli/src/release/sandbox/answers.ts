import type {
    IntegrationAnswerValue,
    IntegrationDefinition,
    IntegrationInput,
    IntegrationObjectListField,
} from "@bernouy/cms-integrations";

export function sandboxAnswers(definition: IntegrationDefinition): Record<string, IntegrationAnswerValue> {
    const required = Object.fromEntries(
        definition.inputs.flatMap((input) => {
            if (input.type === "object-list") {
                const minimum = input.minItems ?? (input.required ? 1 : 0);
                return minimum ? [[input.name, sandboxList(input, minimum)]] : [];
            }
            if (input.defaultValue !== undefined) {
                return [];
            }
            if (!input.required) {
                return [];
            }
            return [[input.name, sandboxValue(input)]];
        }),
    );
    return definition.kind === "consent" ? { ...required, enabled: false } : required;
}

function sandboxValue(input: Exclude<IntegrationInput, { type: "object-list" }>): IntegrationAnswerValue {
    if (input.type === "boolean") {
        return true;
    }
    if (input.type === "json") {
        return {};
    }
    if (input.type === "select") {
        const first = input.options?.[0]?.value;
        if (!first) {
            throw new Error(`Cannot audit required select input ${input.name} without an option`);
        }
        return first;
    }
    if (input.type === "url") {
        return "https://audit.invalid/resource";
    }
    if (input.name === "stripeSecretKey") {
        return "sk_test_ulvia_audit";
    }
    if (input.type === "password") {
        return `ulvia-audit-${input.name}-secret`;
    }
    if (input.name.toLowerCase().endsWith("hash")) {
        return "a".repeat(64);
    }
    if (input.name.toLowerCase().includes("publishablekey")) {
        return "pk_test_ulvia_audit";
    }
    return `ulvia-audit-${input.name}`;
}

function sandboxList(input: Extract<IntegrationInput, { type: "object-list" }>, length: number) {
    return Array.from({ length }, (_, index) =>
        Object.fromEntries(
            input.fields.flatMap((field) => {
                if (!field.required) {
                    return [];
                }
                return [[field.name, sandboxFieldValue(field, index)]];
            }),
        ),
    );
}

function sandboxFieldValue(field: IntegrationObjectListField, index: number): IntegrationAnswerValue {
    if (field.type === "boolean") {
        return true;
    }
    if (field.type === "select") {
        const first = field.options[0]?.value;
        if (!first) {
            throw new Error(`Cannot audit required select field ${field.name} without an option`);
        }
        return field.multiple ? [first] : first;
    }
    if (field.type === "page-link") {
        throw new Error(`Cannot synthesize required page-link field ${field.name} for a release audit`);
    }
    return `ulvia-audit-${field.name}-${index + 1}`;
}
