import { ProviderCapabilityDispatchError } from "../../dispatch/registry";
export function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
