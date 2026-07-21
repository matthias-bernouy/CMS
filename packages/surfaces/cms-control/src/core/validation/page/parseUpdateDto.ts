import MissingParam from "cms-control/errors/Http/MissingParam";
import { coerceVisible } from "./visible";
import { coerceTags } from "../contentDefaults";

export type PageUpdateDto = {
    id: string;
    title: string;
    path: string;
    content: string;
    description: string;
    visible: boolean;
    tags: string[];
};

/**
 * Extract the page-update body into a typed DTO: presence checks + HTTP-shape
 * coercion only. The domain rules + normalization (length, harden, refs,
 * dedupe) run in `ValidatingCmsRepository` at write time.
 */
export function parsePageUpdateDto(body: Record<string, unknown>): PageUpdateDto {
    const { id, title, path } = body;
    if (!id) {
        throw new MissingParam("id");
    }
    if (!title) {
        throw new MissingParam("title");
    }
    if (!path) {
        throw new MissingParam("path");
    }
    return {
        id: String(id),
        title: String(title),
        path: String(path),
        content: body.content == null ? "" : String(body.content),
        description: body.description == null ? "" : String(body.description),
        visible: coerceVisible(body.visible),
        tags: coerceTags(body.tags),
    };
}
