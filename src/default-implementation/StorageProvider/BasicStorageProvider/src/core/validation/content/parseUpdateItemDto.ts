import { assertValidItemName } from "./name";
import { assertValidPublicPath } from "../upload/publicPath";

export type UpdateItemDto = {
    name?:           string;
    parentFolderID?: string | null;
    /** `null` = clear the slug, `undefined` = leave as-is. */
    publicPath?:     string | null;
};

/**
 * Parses + validates a JSON body for `PATCH /api/items?id=…`. All fields are
 * optional; the empty object is rejected since the call would be a no-op
 * round-trip. `parentFolderID === ""` is normalised to `null` (= root).
 */
export function parseUpdateItemDto(body: Record<string, unknown>): UpdateItemDto {
    const dto: UpdateItemDto = {};

    if (body.name !== undefined) {
        if (typeof body.name !== "string") throw new TypeError("name must be a string.");
        assertValidItemName(body.name);
        dto.name = body.name;
    }

    if (body.parentFolderID !== undefined) {
        if (body.parentFolderID === null || body.parentFolderID === "") {
            dto.parentFolderID = null;
        } else if (typeof body.parentFolderID === "string") {
            dto.parentFolderID = body.parentFolderID;
        } else {
            throw new TypeError("parentFolderID must be a string or null.");
        }
    }

    if (body.publicPath !== undefined) {
        if (body.publicPath === null || body.publicPath === "") {
            dto.publicPath = null;
        } else if (typeof body.publicPath === "string") {
            assertValidPublicPath(body.publicPath);
            dto.publicPath = body.publicPath;
        } else {
            throw new TypeError("publicPath must be a string or null.");
        }
    }

    if (Object.keys(dto).length === 0) {
        throw new Error("validation_error: at least one field (name, parentFolderID, publicPath) must be provided.");
    }

    return dto;
}
