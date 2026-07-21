import MissingParam from "cms-control/errors/Http/MissingParam";
import { DEFAULT_TEMPLATE_CONTENT } from "../contentDefaults";

export type TemplateUpdateDto = {
    id: string;
    name: string;
    category: string;
    description: string;
    content: string;
};

/**
 * Extract the template-update body: presence + shape coercion. `identifier`
 * is intentionally absent (immutable). Domain rules run at write time.
 */
export function parseTemplateUpdateDto(body: Record<string, unknown>): TemplateUpdateDto {
    const { id, name } = body;
    if (!id) {
        throw new MissingParam("id");
    }
    if (!name) {
        throw new MissingParam("name");
    }
    const content =
        body.content == null || String(body.content).trim() === "" ? DEFAULT_TEMPLATE_CONTENT : String(body.content);
    return {
        id: String(id),
        name: String(name),
        category: body.category == null ? "" : String(body.category),
        description: body.description == null ? "" : String(body.description),
        content,
    };
}
