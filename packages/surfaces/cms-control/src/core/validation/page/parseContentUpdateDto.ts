import MissingParam from "cms-control/core/admin/http/errors/MissingParam";

export type PageContentUpdateDto = {
    id: string;
    content: string;
};

export function parsePageContentUpdateDto(body: Record<string, unknown>): PageContentUpdateDto {
    if (!body.id) {
        throw new MissingParam("id");
    }
    if (body.content === undefined || body.content === null) {
        throw new MissingParam("content");
    }

    return {
        id: String(body.id),
        content: String(body.content),
    };
}
