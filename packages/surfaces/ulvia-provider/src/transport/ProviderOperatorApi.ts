import { timingSafeEqual } from "node:crypto";
import type { Runner } from "@bernouy/http-runner";
import { readBoundedRequestBody, RequestBodyTooLargeError } from "@bernouy/http-runner";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { assertProviderConnectionToken } from "@bernouy/cms-repository/providers/installations";
import type { CreateProviderInstance, ProviderInstanceLifecycle } from "../instances/lifecycle";

const MAX_BODY_BYTES = 4_096;

export class ProviderOperatorApi {
    constructor(runner: Runner, token: string, lifecycle: ProviderInstanceLifecycle) {
        assertProviderConnectionToken(token);
        const authorized = (handler: (request: Request) => Promise<Response>) => async (request: Request) => {
            if (!operatorAuthorized(request, token)) {
                return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
            }
            return handler(request);
        };

        runner.get(
            "/ulvia/operator/instances",
            authorized(async () => Response.json({ instances: await lifecycle.list() }, noStore())),
        );
        runner.post(
            "/ulvia/operator/instances",
            authorized(async (request) => {
                const idempotencyKey = request.headers.get("idempotency-key") ?? "";
                try {
                    const created = await lifecycle.create(idempotencyKey, await parseCreateInput(request));
                    return Response.json(created, { status: 201, headers: noStore().headers });
                } catch (error) {
                    return operatorError(error);
                }
            }),
        );
        runner.get(
            "/ulvia/operator/instances/:instanceId",
            authorized(async (request) => {
                const instance = await lifecycle.get(instanceIdFrom(request, ""));
                return instance ? Response.json(instance, noStore()) : new Response(null, { status: 404 });
            }),
        );
        runner.post(
            "/ulvia/operator/instances/:instanceId/disable",
            authorized(async (request) => {
                const instance = await lifecycle.disable(instanceIdFrom(request, "/disable"));
                return instance ? Response.json(instance, noStore()) : new Response(null, { status: 404 });
            }),
        );
    }
}

async function parseCreateInput(request: Request): Promise<CreateProviderInstance> {
    const bytes = await readBoundedRequestBody(request, MAX_BODY_BYTES);
    const value = parseStrictJson(bytes, MAX_BODY_BYTES, 4);
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Request body is invalid");
    }
    const input = value as Record<string, unknown>;
    const administrator = input.administrator;
    if (
        Object.keys(input).sort().join(",") !== "administrator,kernelUrl,label" ||
        typeof input.label !== "string" ||
        typeof input.kernelUrl !== "string" ||
        !administrator ||
        typeof administrator !== "object" ||
        Array.isArray(administrator)
    ) {
        throw new TypeError("Request body is invalid");
    }
    const admin = administrator as Record<string, unknown>;
    if (
        Object.keys(admin).sort().join(",") !== "email,password" ||
        typeof admin.email !== "string" ||
        typeof admin.password !== "string"
    ) {
        throw new TypeError("Request body is invalid");
    }
    return {
        label: input.label,
        kernelUrl: input.kernelUrl,
        administrator: { email: admin.email, password: admin.password },
    };
}

function instanceIdFrom(request: Request, suffix: string): string {
    const path = new URL(request.url).pathname;
    return decodeURIComponent(path.slice("/ulvia/operator/instances/".length, suffix ? -suffix.length : undefined));
}

function operatorAuthorized(request: Request, expected: string): boolean {
    const header = request.headers.get("authorization");
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}

function operatorError(error: unknown): Response {
    const status = error instanceof RequestBodyTooLargeError ? 413 : error instanceof TypeError ? 400 : 503;
    return Response.json({ error: { code: status === 503 ? "PROVISIONING_FAILED" : "INVALID_REQUEST" } }, { status });
}

function noStore(): ResponseInit {
    return { headers: { "Cache-Control": "no-store" } };
}
