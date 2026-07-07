export function integrationInstallationId(kind: string): string {
    return kind;
}

export function cleanText(value: unknown): string | null {
    return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function hasAnswer(value: unknown): boolean {
    return value !== undefined && value !== null && value !== "";
}
