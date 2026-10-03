import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";

export function parsePageRevision(value: unknown): number {
    const revision = typeof value === "string" && value.trim() ? Number(value) : value;
    if (!Number.isSafeInteger(revision) || (revision as number) < 1) {
        throw new InvalidParam("revision", "A positive page revision is required.");
    }
    return revision as number;
}
