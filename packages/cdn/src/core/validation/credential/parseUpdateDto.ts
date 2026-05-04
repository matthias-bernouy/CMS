export type CredentialUpdateDto = {
    label?: string;
    expiresAt?: Date;
    revokedAt?: Date;
};

export function parseCredentialUpdateDto(body: Record<string, unknown>): CredentialUpdateDto {
    const dto: CredentialUpdateDto = {};

    if (body.label !== undefined) {
        if (typeof body.label !== "string") throw new TypeError("label must be a string.");
        if (body.label.length > 80) throw new Error(`label too long (${body.label.length}). Max 80.`);
        dto.label = body.label;
    }

    if (body.expiresAt !== undefined && body.expiresAt !== "") {
        const ts = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
        if (Number.isNaN(ts)) throw new Error("expiresAt must be an ISO date string.");
        dto.expiresAt = new Date(ts);
    }

    // `revokedAt` accepts either an ISO date or the literal "true" / "now" — UI
    // typically wants "revoke now" without picking a timestamp.
    if (body.revokedAt !== undefined && body.revokedAt !== "") {
        if (body.revokedAt === "now" || body.revokedAt === true || body.revokedAt === "true") {
            dto.revokedAt = new Date();
        } else if (typeof body.revokedAt === "string") {
            const ts = Date.parse(body.revokedAt);
            if (Number.isNaN(ts)) throw new Error("revokedAt must be an ISO date or \"now\".");
            dto.revokedAt = new Date(ts);
        } else {
            throw new TypeError("revokedAt must be a string or \"now\".");
        }
    }

    return dto;
}
