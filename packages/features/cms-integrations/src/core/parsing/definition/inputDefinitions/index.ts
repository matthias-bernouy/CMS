import { IntegrationInputError, MissingIntegrationParam } from "../../../errors";
import type { IntegrationInput } from "../../../../interfaces/Integration";
import { isStringSecretInputType } from "../../../shared/inputSensitivity";
import { isInputType, isRecord, RESERVED_INPUT_NAMES, text } from "../values";
import { parseObjectListInput, validateObjectListInput } from "./objectList";
import { parseOptionsList } from "./options";

export function parseInput(value: unknown, name: string): IntegrationInput {
    if (!isRecord(value)) {
        throw new IntegrationInputError(name, "must be an object");
    }
    const inputName = text(value.name);
    if (!inputName) {
        throw new MissingIntegrationParam(`${name}.name`);
    }
    if (RESERVED_INPUT_NAMES.has(inputName)) {
        throw new IntegrationInputError(`${name}.name`, "uses a reserved integration field name");
    }
    const label = text(value.label);
    if (!label) {
        throw new MissingIntegrationParam(`${name}.label`);
    }
    const type = text(value.type);
    if (!isInputType(type)) {
        throw new IntegrationInputError(
            `${name}.type`,
            "must be text, url, password, select, boolean, json, or object-list",
        );
    }
    if (value.secret === true && !isStringSecretInputType(type)) {
        throw new IntegrationInputError(`${name}.secret`, "secret inputs must use text, url, or password");
    }
    if (type === "object-list") {
        return parseObjectListInput(value, name, inputName, label);
    }
    const options = Array.isArray(value.options) ? parseOptionsList(value.options, `${name}.options`) : undefined;
    if (type === "select" && !options?.length) {
        throw new IntegrationInputError(`${name}.options`, "select inputs must declare at least one option");
    }
    return {
        name: inputName,
        label,
        type,
        ...(value.required === true ? { required: true } : {}),
        ...(typeof value.defaultValue === "string" || typeof value.defaultValue === "boolean"
            ? { defaultValue: value.defaultValue }
            : {}),
        ...(options ? { options } : {}),
        ...(value.secret === true ? { secret: true } : {}),
    };
}

export function validateInputDefinition(input: IntegrationInput): void {
    if (RESERVED_INPUT_NAMES.has(input.name)) {
        throw new IntegrationInputError(`definition.inputs.${input.name}`, "uses a reserved integration field name");
    }
    if (!isInputType(input.type)) {
        throw new IntegrationInputError(
            `definition.inputs.${input.name}.type`,
            "must be text, url, password, select, boolean, json, or object-list",
        );
    }
    if (input.type === "object-list") {
        validateObjectListInput(input, `definition.inputs.${input.name}`);
        return;
    }
    if (input.type === "select" && !input.options?.length) {
        throw new IntegrationInputError(
            `definition.inputs.${input.name}.options`,
            "select inputs must declare at least one option",
        );
    }
}

export function assertUniqueInputs(inputs: IntegrationInput[]): void {
    const seen = new Set<string>();
    for (const input of inputs) {
        if (seen.has(input.name)) {
            throw new IntegrationInputError(`definition.inputs.${input.name}`, "duplicate input name");
        }
        seen.add(input.name);
    }
}
