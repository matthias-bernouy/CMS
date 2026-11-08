export class AuthoringInputError extends Error {}
export function requiredText(value: unknown): string {
    if (typeof value !== "string" || !value) {
        throw new AuthoringInputError("A nonempty authoring value is required");
    }
    return value;
}
