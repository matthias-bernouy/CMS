import { requireCmsAdmin } from "../auth.ts";
import { boundedInteger, HttpError, json, queryText, requestBody } from "../http.ts";
import { rpcRecord } from "../rest.ts";
import { formDefinition } from "../validation.ts";
import { starterDefinition } from "../builder/model.ts";

export async function handleAdminRoute(route: string, request: Request): Promise<Response | null> {
    if (!route.startsWith("/admin/")) {
        return null;
    }
    const actor = requireCmsAdmin(request);
    const url = new URL(request.url);
    if (route === "/admin/forms") {
        requireMethod(request, "GET");
        return json(
            await rpcRecord("list_managed_forms", {
                p_query: queryText(url, "q"),
                p_status: queryText(url, "status"),
                p_limit: boundedInteger(url.searchParams.get("limit"), "limit", 50, 1, 100),
                p_offset: boundedInteger(url.searchParams.get("offset"), "offset", 0, 0, 1000000),
            }),
        );
    }
    if (route === "/admin/form") {
        requireMethod(request, "GET");
        if (queryText(url, "key", true) === "__new__") {
            return json(newForm());
        }
        const result = await rpcRecord("get_managed_form", { p_form_key: queryText(url, "key", true) });
        return json(result);
    }
    if (route === "/admin/form/draft") {
        requireMethod(request, "POST");
        return json(await saveDraft(request, actor));
    }
    if (route === "/admin/form/publish") {
        requireMethod(request, "POST");
        const key = String((await requestBody(request)).key ?? "");
        const managed = await rpcRecord("get_managed_form", { p_form_key: key });
        formDefinition(managed.draftDefinition);
        return json(await rpcRecord("publish_form", { p_form_key: key, p_actor_id: actor }));
    }
    if (route === "/admin/form/archive") {
        requireMethod(request, "POST");
        const key = String((await requestBody(request)).key ?? "");
        return json(await rpcRecord("archive_form", { p_form_key: key, p_actor_id: actor }));
    }
    return null;
}

async function saveDraft(request: Request, actor: string): Promise<Record<string, unknown>> {
    const body = await requestBody(request);
    const definition = formDefinition(body.definition ?? starterDefinition(body.title));
    definition.title = String(body.title ?? "").trim();
    return await rpcRecord("save_form_draft", {
        p_form_key: body.key,
        p_title: body.title,
        p_description: body.description ?? null,
        p_access_mode: body.accessMode,
        p_definition: definition,
        p_actor_id: actor,
    });
}

function newForm(): Record<string, unknown> {
    return {
        key: "",
        title: "",
        description: "",
        accessMode: "public",
        status: "draft",
        version: null,
        draftDefinition: starterDefinition("Untitled form"),
        publishedAt: null,
        createdAt: null,
        updatedAt: null,
    };
}

function requireMethod(request: Request, method: string): void {
    if (request.method !== method) {
        throw new HttpError(405, `method must be ${method}`);
    }
}
