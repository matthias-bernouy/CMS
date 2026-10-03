import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { parsePageRevision } from "./revision";

export type PageContentUpdateDto = {
    id: string;
    revision: number;
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
        revision: parsePageRevision(body.revision),
        content: String(body.content),
    };
}
