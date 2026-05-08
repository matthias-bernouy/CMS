import InvalidParam from "src/control/errors/Http/InvalidParam";
import MissingParam from "src/control/errors/Http/MissingParam";

export type DataMockupCreateDto = {
    providerId: string;
    method:     string;
    path:       string;
    name:       string;
    status:     number;
    body:       string;
};

const ALLOWED_METHODS = ["GET", "POST", "PUT", "DELETE", "PATCH", "HEAD", "OPTIONS"];

export function parseDataMockupCreateDto(body: Record<string, unknown>): DataMockupCreateDto {
    const { providerId, method, path, name, status, body: rawBody } = body;
    if (!providerId) throw new MissingParam("providerId");
    if (!method)     throw new MissingParam("method");
    if (!path)       throw new MissingParam("path");
    if (!name)       throw new MissingParam("name");

    if (typeof providerId !== "string") throw new InvalidParam("providerId", "Must be a string.");
    if (typeof method     !== "string") throw new InvalidParam("method",     "Must be a string.");
    if (typeof path       !== "string") throw new InvalidParam("path",       "Must be a string.");
    if (typeof name       !== "string") throw new InvalidParam("name",       "Must be a string.");

    const upper = method.toUpperCase();
    if (!ALLOWED_METHODS.includes(upper)) {
        throw new InvalidParam("method", `Must be one of ${ALLOWED_METHODS.join(", ")}.`);
    }
    if (!path.startsWith("/")) {
        throw new InvalidParam("path", "Must start with /.");
    }
    if (name.length > 60) {
        throw new InvalidParam("name", "Must be 60 chars or less.");
    }

    const numStatus = typeof status === "string" ? Number(status) : status;
    if (!Number.isInteger(numStatus) || (numStatus as number) < 100 || (numStatus as number) > 599) {
        throw new InvalidParam("status", "Must be an integer between 100 and 599.");
    }

    const bodyStr = typeof rawBody === "string" ? rawBody : JSON.stringify(rawBody ?? {});
    try { JSON.parse(bodyStr); }
    catch { throw new InvalidParam("body", "Must be valid JSON."); }

    return {
        providerId,
        method: upper,
        path,
        name,
        status: numStatus as number,
        body:   bodyStr,
    };
}
