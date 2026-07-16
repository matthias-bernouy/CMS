import type { IdentityService, IdentityValue } from "@bernouy/cms-identities";
import type { SourceEndpoint } from "../../interfaces/Source";
import type { SourceComputedContext } from "../buildUpstreamUrl";
import { dataShapeAtPath, dataValueAtPath } from "../parseDataShape";

const MAX_IDENTITY_BINDING_RESPONSE_BYTES = 64 * 1024;

export async function bindResponseIdentities(
    endpoint: SourceEndpoint,
    response: Response,
    computed: SourceComputedContext,
    identities: IdentityService | undefined,
): Promise<Response | null> {
    const bindings = endpoint.effects?.identityBindings ?? [];
    if (!bindings.length || !response.ok) return null;
    if (!identities) return new Response("identity service not configured", { status: 500 });
    const subjectId = typeof computed.userID === "string" ? computed.userID.trim() : "";
    if (!subjectId) return new Response("identity binding requires an authenticated user", { status: 401 });
    const parsed = await readIdentityBindingPayload(response);
    if (!parsed.ok) return new Response("identity binding response is invalid", { status: 502 });

    try {
        const outputShape = responseShape(endpoint, response.status);
        for (const binding of bindings) {
            const value = dataValueAtPath(parsed.payload, binding.responsePath);
            if (!isIdentityValue(value)) continue;
            const shape = dataShapeAtPath(outputShape, binding.responsePath);
            const authority = shape?.semantic?.kind === "user-id" ? shape.semantic.authority : undefined;
            if (!authority) {
                return new Response(
                    `identity binding path is not a qualified user-id: ${binding.responsePath}`,
                    { status: 500 },
                );
            }
            await identities.bind(subjectId, { authority, kind: binding.kind, value });
        }
        return null;
    } catch {
        return new Response("identity binding failed", { status: 502 });
    }
}

function responseShape(endpoint: SourceEndpoint, status: number) {
    return endpoint.output?.find(output => output.status === String(status))?.body
        ?? endpoint.output?.find(output => output.status === "default")?.body;
}

function isIdentityValue(value: unknown): value is IdentityValue {
    return (typeof value === "string" && !!value.trim()) || (typeof value === "number" && Number.isFinite(value));
}

async function readIdentityBindingPayload(
    response: Response,
): Promise<{ ok: true; payload: unknown } | { ok: false }> {
    try {
        const body = response.clone().body;
        if (!body) return { ok: false };
        const reader = body.getReader();
        const chunks: Uint8Array[] = [];
        let size = 0;
        while (true) {
            const { value, done } = await reader.read();
            if (done) break;
            size += value.byteLength;
            if (size > MAX_IDENTITY_BINDING_RESPONSE_BYTES) {
                await reader.cancel().catch(() => undefined);
                return { ok: false };
            }
            chunks.push(value);
        }
        const bytes = new Uint8Array(size);
        let offset = 0;
        for (const chunk of chunks) {
            bytes.set(chunk, offset);
            offset += chunk.byteLength;
        }
        return { ok: true, payload: JSON.parse(new TextDecoder().decode(bytes)) as unknown };
    } catch {
        return { ok: false };
    }
}
