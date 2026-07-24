import { IntegrationInputError } from "../errors";
import type { IntegrationDefinition, IntegrationInput, IntegrationValueInput } from "../../interfaces/Integration";

export function isSensitiveInput(input: IntegrationInput): input is IntegrationValueInput {
    return input.type !== "object-list" && (input.secret === true || input.type === "password");
}

export function sensitiveInputNames(definition: Pick<IntegrationDefinition, "inputs">): string[] {
    return definition.inputs.filter(isSensitiveInput).map((input) => input.name);
}

export function assertPasswordInputsDeclareSecrets(definition: Pick<IntegrationDefinition, "inputs">): void {
    for (const input of definition.inputs) {
        if (input.type === "password" && input.secret !== true) {
            throw new IntegrationInputError(
                `definition.inputs.${input.name}.secret`,
                "password inputs must declare secret: true",
            );
        }
    }
}
