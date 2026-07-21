import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { readJsonBody } from "cms-control/core/http/readJsonBody";

/** Read an object-shaped JSON body or a browser form submission. */
export async function readJsonOrFormBody(req: Request): Promise<Record<string, unknown>> {
    const contentType = req.headers.get("content-type")?.split(";", 1)[0]?.trim().toLowerCase() ?? "";
    if (!contentType || contentType === "application/json" || contentType.endsWith("+json")) {
        return readJsonBody(req);
    }
    if (contentType !== "multipart/form-data" && contentType !== "application/x-www-form-urlencoded") {
        throw new InvalidParam("body", "JSON object or form data expected.");
    }

    const form = await req.formData().catch(() => null);
    if (!form) {
        throw new InvalidParam("body", "valid form data expected.");
    }

    const body: Record<string, unknown> = {};
    for (const [key, value] of form.entries()) {
        const current = body[key];
        if (current === undefined) {
            body[key] = value;
        } else if (Array.isArray(current)) {
            current.push(value);
        } else {
            body[key] = [current, value];
        }
    }
    return body;
}
