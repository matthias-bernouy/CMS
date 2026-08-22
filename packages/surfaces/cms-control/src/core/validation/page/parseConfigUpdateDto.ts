import MissingParam from "cms-control/core/admin/http/errors/MissingParam";
import { coerceTags } from "./tags";
import { coerceVisible } from "./visible";

export type PageConfigUpdateDto = {
    id: string;
    title: string;
    path: string;
    description: string;
    visible: boolean;
    tags: string[];
};

export function parsePageConfigUpdateDto(id: string, body: Record<string, unknown>): PageConfigUpdateDto {
    const { title, path } = body;
    if (!title) {
        throw new MissingParam("title");
    }
    if (!path) {
        throw new MissingParam("path");
    }

    return {
        id,
        title: String(title),
        path: String(path),
        description: body.description == null ? "" : String(body.description),
        visible: coerceVisible(body.published),
        tags: coerceTags(body.tags),
    };
}
