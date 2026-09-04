import { serviceRoleKey, requiredEnv } from "./env.ts";
import { HttpError } from "./errors.ts";
import { isRecord } from "./records.ts";

const schema = "consent";
const rpcTimeoutMilliseconds = 1_000;
const maximumRpcResponseBytes = 1_048_576;

export async function rpc<T>(name: string, body: Record<string, unknown>): Promise<T> {
    const key = serviceRoleKey();
    const headers = new Headers({ "content-type": "application/json" });
    headers.set("apikey", key);
    if (key.startsWith("sb_")) {
        headers.delete("authorization");
    } else {
        headers.set("authorization", `Bearer ${key}`);
    }
    headers.set("accept-profile", schema);
    headers.set("content-profile", schema);
    const baseUrl = requiredEnv("SUPABASE_URL").replace(/\/$/, "");
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), rpcTimeoutMilliseconds);
    try {
        const response = await fetch(`${baseUrl}/rest/v1/rpc/${encodeURIComponent(name)}`, {
            method: "POST",
            body: JSON.stringify(body),
            headers,
            signal: controller.signal,
        });
        const value = await responseJson(response);
        if (!response.ok) {
            throw restError(response.status, value);
        }
        return value as T;
    } catch (error) {
        if (error instanceof HttpError) {
            throw error;
        }
        throw new HttpError(
            controller.signal.aborted ? 504 : 502,
            controller.signal.aborted ? "consent storage request timed out" : "consent storage request failed",
        );
    } finally {
        clearTimeout(timeout);
    }
}

function restError(status: number, value: unknown): HttpError {
    const message = isRecord(value) && typeof value.message === "string" ? value.message : "database request failed";
    if (message.startsWith("validation:")) {
        return new HttpError(400, message.slice("validation:".length).trim());
    }
    if (message.startsWith("not_found:")) {
        return new HttpError(404, message.slice("not_found:".length).trim());
    }
    if (message.startsWith("conflict:")) {
        return new HttpError(409, message.slice("conflict:".length).trim());
    }
    return new HttpError(502, "consent storage request failed");
}

async function responseJson(response: Response): Promise<unknown> {
    const declared = Number(response.headers.get("content-length"));
    if (Number.isFinite(declared) && declared > maximumRpcResponseBytes) {
        throw new HttpError(502, "consent storage response is too large");
    }
    const reader = response.body?.getReader();
    if (!reader) {
        throw new HttpError(502, "consent storage response is empty");
    }
    const decoder = new TextDecoder();
    let bytes = 0;
    let text = "";
    while (true) {
        const chunk = await reader.read();
        if (chunk.done) {
            break;
        }
        bytes += chunk.value.byteLength;
        if (bytes > maximumRpcResponseBytes) {
            await reader.cancel();
            throw new HttpError(502, "consent storage response is too large");
        }
        text += decoder.decode(chunk.value, { stream: true });
    }
    try {
        return JSON.parse(text + decoder.decode());
    } catch {
        throw new HttpError(502, `consent storage returned invalid JSON (${response.status})`);
    }
}
