import { HttpError } from "./types.ts";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function intValue(value: unknown, name: string, fallback: number, min: number, max: number): number {
    const parsed = value === undefined || value === null || value === "" ? fallback : Number(value);
    if (!Number.isInteger(parsed) || parsed < min || parsed > max) {
        throw new HttpError(400, `${name} must be an integer`);
    }
    return parsed;
}

export function idParam(request: Request): string {
    const id = new URL(request.url).searchParams.get("id") ?? "";
    if (!id) {
        throw new HttpError(400, "id is required");
    }
    if (!UUID.test(id)) {
        throw new HttpError(400, "id must be a UUID");
    }
    return id;
}
