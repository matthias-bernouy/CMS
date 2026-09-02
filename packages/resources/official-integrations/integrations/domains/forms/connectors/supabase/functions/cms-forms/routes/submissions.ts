import { requireCmsAdmin } from "../auth.ts";
import { boundedInteger, HttpError, isRecord, json, queryText, requestBody } from "../http.ts";
import { rpcRecord } from "../rest.ts";

export async function handleSubmissionRoute(route: string, request: Request): Promise<Response | null> {
    if (!route.startsWith("/admin/submission")) {
        return null;
    }
    const actor = requireCmsAdmin(request);
    const url = new URL(request.url);
    if (route === "/admin/submissions") {
        requireMethod(request, "GET");
        return json(
            await rpcRecord("list_submissions", {
                p_form_key: queryText(url, "key"),
                p_status: queryText(url, "status"),
                p_limit: boundedInteger(url.searchParams.get("limit"), "limit", 100, 1, 200),
                p_offset: boundedInteger(url.searchParams.get("offset"), "offset", 0, 0, 1000000),
            }),
        );
    }
    if (route === "/admin/submission") {
        requireMethod(request, "GET");
        return json(await submissionDetail(numericId(queryText(url, "id", true))));
    }
    if (route === "/admin/submission/status") {
        requireMethod(request, "POST");
        const body = await requestBody(request);
        const id = boundedInteger(body.id, "id", 0, 1, Number.MAX_SAFE_INTEGER);
        await rpcRecord("update_submission_status", {
            p_submission_id: id,
            p_status: body.status,
            p_actor_id: actor,
        });
        return json(await submissionDetail(id));
    }
    return null;
}

async function submissionDetail(id: number): Promise<Record<string, unknown>> {
    const submission = await rpcRecord("get_submission", { p_submission_id: id });
    const rawAnswers = isRecord(submission.answers) ? submission.answers : {};
    const definition = isRecord(submission.definition) ? submission.definition : {};
    const rows: Record<string, unknown>[] = [];
    for (const section of Array.isArray(definition.steps) ? definition.steps : []) {
        if (!isRecord(section) || !Array.isArray(section.fields)) {
            continue;
        }
        for (const field of section.fields) {
            if (!isRecord(field) || typeof field.key !== "string") {
                continue;
            }
            rows.push({
                key: field.key,
                section: String(section.title ?? "Section"),
                question: String(field.label ?? field.key),
                answer: displayAnswer(rawAnswers[field.key], field),
            });
        }
    }
    const { definition: _definition, answers: _answers, ...detail } = submission;
    return { ...detail, answers: rows };
}

function displayAnswer(value: unknown, field: Record<string, unknown>): string {
    if (value === undefined || value === null || value === "") {
        return "—";
    }
    if (field.type === "checkbox") {
        return String(value) === "true" ? "Yes" : "No";
    }
    const labels = new Map(
        (Array.isArray(field.options) ? field.options : [])
            .filter(isRecord)
            .map((option) => [
                String(option.key ?? option.value ?? ""),
                String(option.label ?? option.key ?? option.value ?? ""),
            ]),
    );
    const displayed = (Array.isArray(value) ? value : [value]).map((item) => labels.get(String(item)) ?? String(item));
    return displayed.join(", ");
}

function numericId(value: string): number {
    return boundedInteger(value, "id", 0, 1, Number.MAX_SAFE_INTEGER);
}

function requireMethod(request: Request, method: string): void {
    if (request.method !== method) {
        throw new HttpError(405, `method must be ${method}`);
    }
}
