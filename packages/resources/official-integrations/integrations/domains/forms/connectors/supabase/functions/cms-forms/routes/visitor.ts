import { cmsUserId } from "../auth.ts";
import { boundedInteger, HttpError, isRecord, json, methodNotAllowed, queryText, requestBody } from "../http.ts";
import { rpcRecord } from "../rest.ts";
import { formDefinition, submissionAnswers } from "../validation.ts";

export async function handleVisitorRoute(route: string, request: Request): Promise<Response | null> {
    const authenticated = route.startsWith("/authenticated/");
    if (!authenticated && !route.startsWith("/public/")) {
        return null;
    }
    const actor = authenticated ? cmsUserId(request) : null;
    if (route.endsWith("/form")) {
        if (request.method !== "GET") {
            return methodNotAllowed("GET");
        }
        return json(await publishedForm(request, actor));
    }
    if (route.endsWith("/submission")) {
        if (request.method !== "POST") {
            return methodNotAllowed("POST");
        }
        return await submit(request, actor);
    }
    return null;
}

async function publishedForm(request: Request, actor: string | null): Promise<Record<string, unknown>> {
    const url = new URL(request.url);
    return await rpcRecord("get_published_form", {
        p_form_key: queryText(url, "key", true),
        p_version: url.searchParams.has("version")
            ? boundedInteger(url.searchParams.get("version"), "version", 1, 1, 2147483647)
            : null,
        p_actor_id: actor,
    });
}

async function submit(request: Request, actor: string | null): Promise<Response> {
    const body = await requestBody(request);
    const published = await publishedForm(request, actor);
    const definition = formDefinition(published.definition);
    const website = typeof body.website === "string" ? body.website.trim() : "";
    if (website || (body.startedAt !== undefined && completedTooQuickly(body.startedAt, definition.minCompletionMs))) {
        return json({ ok: true, receiptId: crypto.randomUUID() }, 202);
    }
    const idempotencyKey = identifier(body.idempotencyKey ?? crypto.randomUUID(), "idempotencyKey", 16, 200);
    const sessionId = identifier(body.sessionId ?? crypto.randomUUID(), "sessionId", 36, 36);
    const version = boundedInteger(body.version, "version", Number(published.version), 1, 2147483647);
    if (version !== published.version) {
        throw new HttpError(409, "the form version changed; reload before submitting");
    }
    const result = await rpcRecord("submit_form", {
        p_form_key: published.key,
        p_version: version,
        p_idempotency_key: idempotencyKey,
        p_session_id: sessionId,
        p_answers: submissionAnswers(definition, isRecord(body.answers) ? body.answers : null),
        p_actor_id: actor,
        p_metadata: { locale: request.headers.get("accept-language")?.slice(0, 64) || null },
    });
    return json(result, 202);
}

function identifier(value: unknown, name: string, minimum: number, maximum: number): string {
    if (
        typeof value !== "string" ||
        value.length < minimum ||
        value.length > maximum ||
        !/^[A-Za-z0-9_-]+$/.test(value)
    ) {
        throw new HttpError(422, `${name} is invalid`);
    }
    return value;
}

function completedTooQuickly(startedAt: unknown, minimum: unknown): boolean {
    const timestamp = typeof startedAt === "string" ? Date.parse(startedAt) : Number.NaN;
    const threshold = Number.isFinite(Number(minimum)) ? Math.min(Math.max(Number(minimum), 0), 60000) : 1000;
    if (!Number.isFinite(timestamp)) {
        throw new HttpError(422, "startedAt is invalid");
    }
    return Date.now() - timestamp < threshold;
}
