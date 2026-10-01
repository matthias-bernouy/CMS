import { timingSafeEqual } from "node:crypto";
import { decodeHttpParameter } from "@bernouy/cms-repository/contracts/bindings";
import { parseStrictJson } from "@bernouy/cms-repository/contracts/protocol";
import { validateSchemaValue } from "@bernouy/cms-repository/contracts/schema";
import type { ContractRelease } from "@bernouy/cms-repository/contracts";
import type { ProviderRuntimeReport } from "@bernouy/cms-repository/providers/installations";
import type { OfficialSubmissionStore } from "../core/submissions";

const ITEM = Object.freeze({ id: "starter", name: "Starter item" });
const MEDIA =
    '<svg xmlns="http://www.w3.org/2000/svg" width="160" height="80" viewBox="0 0 160 80"><rect width="160" height="80" rx="12" fill="#1d4ed8"/><circle cx="42" cy="40" r="20" fill="#ffffff"/><path d="M80 40h48" stroke="#ffffff" stroke-width="10" stroke-linecap="round"/></svg>';

export function createOfficialProviderHandler(options: {
    token: string;
    report: ProviderRuntimeReport;
    forms: ContractRelease;
    submissions: OfficialSubmissionStore;
}): (request: Request) => Promise<Response> {
    const createSchema = options.forms.capabilities.find((item) => item.id === "submission.create")?.input;
    if (!createSchema) {
        throw new Error("Official forms contract lacks submission.create");
    }
    return async (request) => {
        if (!authorized(request.headers.get("authorization"), options.token)) {
            return new Response(null, { status: 401, headers: { "WWW-Authenticate": "Bearer" } });
        }
        const path = new URL(request.url).pathname;
        if (request.method === "GET" && path === "/ulvia/report") {
            return Response.json(options.report, { headers: { "Cache-Control": "no-store" } });
        }
        if (request.method === "GET" && path === "/v1/catalog/items") {
            return Response.json({ items: [ITEM] });
        }
        if (request.method === "GET" && path.startsWith("/v1/catalog/items/")) {
            return pathParameter(path, "/v1/catalog/items/", 64) === ITEM.id
                ? Response.json(ITEM)
                : error("NOT_FOUND", 404);
        }
        if (request.method === "POST" && path === "/v1/forms/submissions") {
            let input: unknown;
            try {
                const bytes = await readBody(request, 8192);
                input = parseStrictJson(bytes, 8192, 8);
                validateSchemaValue(createSchema, input);
            } catch {
                return error("INVALID_SUBMISSION", 422);
            }
            const { email, message } = input as { email: string; message: string };
            const submission = await options.submissions.create({ email, message });
            return Response.json({ id: submission.id }, { status: 201 });
        }
        if (request.method === "GET" && path.startsWith("/v1/forms/submissions/")) {
            const id = pathParameter(path, "/v1/forms/submissions/", 36);
            const submission = id ? await options.submissions.get(id) : null;
            return submission
                ? Response.json(submission, { headers: { "Cache-Control": "no-store" } })
                : error("NOT_FOUND", 404);
        }
        if (request.method === "GET" && pathParameter(path, "/v1/media/", 64) === "starter-mark") {
            return new Response(MEDIA, { headers: { "Content-Type": "image/svg+xml" } });
        }
        if (request.method === "GET" && path.startsWith("/v1/media/")) {
            return error("NOT_FOUND", 404);
        }
        return new Response(null, { status: 404 });
    };
}

function pathParameter(path: string, prefix: string, maxLength: number): string | null {
    if (!path.startsWith(prefix)) {
        return null;
    }
    try {
        const value = decodeHttpParameter({ type: "string", maxLength }, path.slice(prefix.length));
        return typeof value === "string" ? value : null;
    } catch {
        return null;
    }
}

function error(code: string, status: number): Response {
    return Response.json({ error: { code } }, { status });
}

function authorized(header: string | null, expected: string): boolean {
    if (!header?.startsWith("Bearer ")) {
        return false;
    }
    const received = Buffer.from(header.slice(7));
    const secret = Buffer.from(expected);
    return received.length === secret.length && timingSafeEqual(received, secret);
}

async function readBody(request: Request, limit: number): Promise<Uint8Array> {
    if (!request.body) {
        return new Uint8Array();
    }
    const reader = request.body.getReader();
    const parts: Uint8Array[] = [];
    let size = 0;
    try {
        for (;;) {
            const next = await reader.read();
            if (next.done) {
                break;
            }
            size += next.value.byteLength;
            if (size > limit) {
                await reader.cancel();
                throw new Error("Submission body is too large");
            }
            parts.push(next.value);
        }
    } finally {
        reader.releaseLock();
    }
    const bytes = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) {
        bytes.set(part, offset);
        offset += part.byteLength;
    }
    return bytes;
}
