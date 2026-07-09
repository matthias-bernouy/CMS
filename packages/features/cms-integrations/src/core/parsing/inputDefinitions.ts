import { IntegrationInputError, MissingIntegrationParam } from "../errors";
import type { IntegrationInput } from "../../interfaces/Integration";
import {
    isInputType,
    isRecord,
    RESERVED_INPUT_NAMES,
    text,
} from "./values";

export function parseInput(value: unknown, name: string): IntegrationInput {
    if (!isRecord(value)) throw new IntegrationInputError(name, "must be an object");
    const inputName = text(value.name);
    if (!inputName) throw new MissingIntegrationParam(`${name}.name`);
    if (RESERVED_INPUT_NAMES.has(inputName)) throw new IntegrationInputError(`${name}.name`, "uses a reserved integration field name");
    const label = text(value.label);
    if (!label) throw new MissingIntegrationParam(`${name}.label`);
    const type = text(value.type);
    if (!isInputType(type)) throw new IntegrationInputError(`${name}.type`, "must be text, url, password, select, boolean, or json");
    const options = Array.isArray(value.options) ? parseOptionsList(value.options, `${name}.options`) : undefined;
    if (type === "select" && !options?.length) {
        throw new IntegrationInputError(`${name}.options`, "select inputs must declare at least one option");
    }
    return {
        name: inputName,
        label,
        type,
        ...(value.required === true ? { required: true } : {}),
        ...(typeof value.defaultValue === "string" || typeof value.defaultValue === "boolean" ? { defaultValue: value.defaultValue } : {}),
        ...(options ? { options } : {}),
        ...(value.secret === true ? { secret: true } : {}),
    };
}

export function validateInputDefinition(input: IntegrationInput): void {
    if (RESERVED_INPUT_NAMES.has(input.name)) {
        throw new IntegrationInputError(`definition.inputs.${input.name}`, "uses a reserved integration field name");
    }
    if (!isInputType(input.type)) {
        throw new IntegrationInputError(`definition.inputs.${input.name}.type`, "must be text, url, password, select, boolean, or json");
    }
    if (input.type === "select" && !input.options?.length) {
        throw new IntegrationInputError(`definition.inputs.${input.name}.options`, "select inputs must declare at least one option");
    }
}

export function assertUniqueInputs(inputs: IntegrationInput[]): void {
    const seen = new Set<string>();
    for (const input of inputs) {
        if (seen.has(input.name)) throw new IntegrationInputError(`definition.inputs.${input.name}`, "duplicate input name");
        seen.add(input.name);
    }
}

function parseOptionsList(values: unknown[], name: string): Array<{ label: string; value: string }> {
    return values.map((entry, index) => {
        if (!isRecord(entry)) throw new IntegrationInputError(`${name}.${index}`, "must be an object");
        const label = text(entry.label);
        const value = text(entry.value);
        if (!label) throw new MissingIntegrationParam(`${name}.${index}.label`);
        if (!value) throw new MissingIntegrationParam(`${name}.${index}.value`);
        return { label, value };
    });
}
