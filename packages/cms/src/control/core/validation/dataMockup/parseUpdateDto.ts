import InvalidParam from "src/control/errors/Http/InvalidParam";

export type DataMockupUpdateDto = {
    name?:   string;
    status?: number;
    body?:   string;
};

export function parseDataMockupUpdateDto(body: Record<string, unknown>): DataMockupUpdateDto {
    const out: DataMockupUpdateDto = {};

    if (body.name !== undefined) {
        if (typeof body.name !== "string") throw new InvalidParam("name", "Must be a string.");
        if (body.name.length === 0)        throw new InvalidParam("name", "Must not be empty.");
        if (body.name.length > 60)         throw new InvalidParam("name", "Must be 60 chars or less.");
        out.name = body.name;
    }
    if (body.status !== undefined) {
        const n = typeof body.status === "string" ? Number(body.status) : body.status;
        if (!Number.isInteger(n) || (n as number) < 100 || (n as number) > 599) {
            throw new InvalidParam("status", "Must be an integer between 100 and 599.");
        }
        out.status = n as number;
    }
    if (body.body !== undefined) {
        const s = typeof body.body === "string" ? body.body : JSON.stringify(body.body);
        try { JSON.parse(s); }
        catch { throw new InvalidParam("body", "Must be valid JSON."); }
        out.body = s;
    }
    return out;
}
