import { json } from "../core/http.ts";
import { contextKey } from "../core/records.ts";
import { rpc } from "../core/rest.ts";

export async function getRequirements(request: Request): Promise<Response> {
    const context = contextKey(new URL(request.url).searchParams.get("context"));
    const result = await rpc<Record<string, unknown>>("consent_requirements_projection", {
        p_context_key: context,
    });
    return json(result);
}
