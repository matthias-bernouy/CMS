import { serviceRoleKey, supabaseUrl } from "./auth.ts";
import { HttpError, isRecord } from "./http.ts";

const schema = "forms";

export async function rpc(name: string, body: Record<string, unknown> = {}): Promise<unknown> {
    const key = serviceRoleKey();
    const headers = new Headers({
        apikey: key,
        "accept-profile": schema,
        "content-profile": schema,
        "content-type": "application/json",
    });
    if (!key.startsWith("sb_")) {
        headers.set("authorization", `Bearer ${key}`);
    }
    const response = await fetch(`${supabaseUrl()}/rest/v1/rpc/${name}`, {
        method: "POST",
        headers,
        body: JSON.stringify(body),
    });
    if (!response.ok) {
        throw await restError(response);
    }
    return await response.json();
}

export async function rpcRecord(name: string, body: Record<string, unknown> = {}): Promise<Record<string, unknown>> {
    const result = await rpc(name, body);
    if (!isRecord(result)) {
        throw new HttpError(502, `${name} returned an invalid response`);
    }
    return result;
}

async function restError(response: Response): Promise<HttpError> {
    const body = await response.json().catch(() => null);
    const message =
        isRecord(body) && typeof body.message === "string" ? body.message : `Supabase error (${response.status})`;
    const prefix = /^(validation|conflict|forbidden|not_found):\s*/.exec(message)?.[1];
    const clean = message.replace(/^[^:]+:\s*/, "");
    if (prefix === "validation") {
        return new HttpError(422, clean);
    }
    if (prefix === "conflict") {
        return new HttpError(409, clean);
    }
    if (prefix === "forbidden") {
        return new HttpError(403, clean);
    }
    if (prefix === "not_found") {
        return new HttpError(404, clean);
    }
    return new HttpError(response.status < 500 ? 422 : 502, message);
}
