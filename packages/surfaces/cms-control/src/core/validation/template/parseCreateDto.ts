import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export type TemplateCreateDto = {
    identifier: string;
    name: string;
    category: string;
};

/**
 * Extract the template-create body: presence + shape coercion. The identifier
 * is immutable post-creation. Domain rules run in `ValidatingCmsRepository`.
 */
export function parseTemplateCreateDto(body: Record<string, unknown>): TemplateCreateDto {
    const { identifier, name } = body;
    if (!identifier) {
        throw new MissingParam("identifier");
    }
    if (!name) {
        throw new MissingParam("name");
    }
    return {
        identifier: String(identifier),
        name: String(name),
        category: body.category == null ? "" : String(body.category),
    };
}
