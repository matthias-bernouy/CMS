export type CredentialCreateDto = {
    label?: string;
    expiresAt?: Date;
};

export function parseCredentialCreateDto(body: Record<string, unknown>): CredentialCreateDto {
    const dto: CredentialCreateDto = {};

    if (body.label !== undefined && body.label !== "") {
        if (typeof body.label !== "string") throw new TypeError("label must be a string.");
        if (body.label.length > 80) throw new Error(`label too long (${body.label.length}). Max 80.`);
        dto.label = body.label;
    }

    if (body.expiresAt !== undefined && body.expiresAt !== "") {
        const ts = typeof body.expiresAt === "string" ? Date.parse(body.expiresAt) : NaN;
        if (Number.isNaN(ts)) throw new Error("expiresAt must be an ISO date string.");
        dto.expiresAt = new Date(ts);
    }

    return dto;
}
