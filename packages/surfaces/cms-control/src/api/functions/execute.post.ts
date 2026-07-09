import { executeFunction } from "@bernouy/cms-functions";
import type { ControlCms } from "cms-control/ControlCms";
import { readJsonBody } from "cms-control/core/http/readJsonBody";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import MissingParam from "cms-control/errors/Http/MissingParam";

export default async function executeAdminFunction(req: Request, cms: ControlCms): Promise<Response> {
    const repository = cms.functions;
    if (!repository) return new Response("functions not configured", { status: 501 });

    const payload = await readJsonBody(req);
    const id = typeof payload.id === "string" ? payload.id.trim() : "";
    if (!id) throw new MissingParam("id");

    const fn = await repository.getFunction(id);
    if (!fn) return new Response("function not found", { status: 404 });

    const params = parseParams(payload.params);
    const url = executionUrl(req, id, params);
    const init: RequestInit = {
        method: fn.method,
        headers: { "content-type": "application/json" },
    };
    if (fn.method !== "GET" && fn.method !== "HEAD" && Object.hasOwn(payload, "body")) {
        init.body = JSON.stringify(payload.body);
    }

    const subject = await cms.auth.getSubject(req).catch(() => null);
    return executeFunction(fn, new Request(url, init), {
        sources: cms.sources,
        deps: cms.sourceExecutorDeps,
        user: subject ? { id: subject.identifier, role: subject.role } : undefined,
        includeCallErrorDetails: true,
    });
}

function parseParams(value: unknown): Record<string, string> {
    if (value === undefined) return {};
    if (!isRecord(value)) throw new InvalidParam("params", "must be an object.");

    const params: Record<string, string> = {};
    for (const [key, raw] of Object.entries(value)) {
        if (raw === undefined || raw === null) continue;
        if (typeof raw === "object") throw new InvalidParam(`params.${key}`, "must be a scalar value.");
        params[key] = String(raw);
    }
    return params;
}

function executionUrl(req: Request, id: string, params: Record<string, string>): string {
    const url = new URL(`/functions/${encodeURIComponent(id)}`, new URL(req.url).origin);
    for (const [key, value] of Object.entries(params)) url.searchParams.set(key, value);
    return url.toString();
}

function isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === "object" && value !== null && !Array.isArray(value);
}
