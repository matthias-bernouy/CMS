import { requireCmsAdmin } from "../auth.ts";
import {
    createQuestion,
    deleteQuestion,
    getQuestion,
    listQuestions,
    reorderQuestions,
    saveQuestion,
} from "../builder/questions.ts";
import {
    createSection,
    deleteSection,
    getSection,
    listSections,
    reorderSections,
    saveSection,
} from "../builder/sections.ts";
import { HttpError, json, queryText, requestBody } from "../http.ts";

export async function handleBuilderRoute(route: string, request: Request): Promise<Response | null> {
    if (!route.startsWith("/admin/form/")) {
        return null;
    }
    const actor = requireCmsAdmin(request);
    const url = new URL(request.url);
    if (route === "/admin/form/sections") {
        requireMethod(request, "GET");
        return json(await listSections(queryText(url, "context", true)));
    }
    if (route === "/admin/form/sections/create") {
        requireMethod(request, "POST");
        return json(await createSection((await requestBody(request)).context, actor));
    }
    if (route === "/admin/form/sections/reorder") {
        requireMethod(request, "POST");
        const body = await requestBody(request);
        return json(await reorderSections(body.context, body.refs, actor));
    }
    if (route === "/admin/form/section") {
        if (request.method === "GET") {
            return json(await getSection(queryText(url, "ref", true)));
        }
        requireMethod(request, "POST");
        return json(await saveSection(await requestBody(request), actor));
    }
    if (route === "/admin/form/section/delete") {
        requireMethod(request, "POST");
        return json(await deleteSection((await requestBody(request)).ref, actor));
    }
    if (route === "/admin/form/questions") {
        requireMethod(request, "GET");
        return json(await listQuestions(queryText(url, "context", true)));
    }
    if (route === "/admin/form/questions/create") {
        requireMethod(request, "POST");
        return json(await createQuestion((await requestBody(request)).context, actor));
    }
    if (route === "/admin/form/questions/reorder") {
        requireMethod(request, "POST");
        const body = await requestBody(request);
        return json(await reorderQuestions(body.context, body.refs, actor));
    }
    if (route === "/admin/form/question") {
        if (request.method === "GET") {
            return json(await getQuestion(queryText(url, "ref", true)));
        }
        requireMethod(request, "POST");
        return json(await saveQuestion(await requestBody(request), actor));
    }
    if (route === "/admin/form/question/delete") {
        requireMethod(request, "POST");
        return json(await deleteQuestion((await requestBody(request)).ref, actor));
    }
    return null;
}

function requireMethod(request: Request, method: string): void {
    if (request.method !== method) {
        throw new HttpError(405, `method must be ${method}`);
    }
}
