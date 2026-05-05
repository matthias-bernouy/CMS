import { assertValidItemName } from "../../validation/content/name";
import { assertValidPublicPath } from "../../validation/upload/publicPath";

export type MintTokenDto = {
    name:           string;
    parentFolderID: string | null;
    maxSize:        number;
    contentType?:   string;
    publicPath?:    string;
    /** Time-to-live in seconds. Bounded between MIN_TTL_SEC and MAX_TTL_SEC. */
    ttlSec:         number;
    /** Replace an existing file with the same name (in the same parent
     *  folder). Folder collisions still throw. */
    overwrite?:     boolean;
};

export const MIN_TTL_SEC     = 60;
export const MAX_TTL_SEC     = 3600;
export const DEFAULT_TTL_SEC = 600;

/**
 * Parses the body of `POST /api/upload-tokens`. The broker mints these on
 * behalf of an end user — the user never reaches this endpoint directly.
 */
export function parseMintTokenDto(body: Record<string, unknown>): MintTokenDto {
    if (typeof body.name !== "string") throw new TypeError("name must be a string.");
    assertValidItemName(body.name);

    let parentFolderID: string | null = null;
    if (body.parentFolderID !== undefined && body.parentFolderID !== null && body.parentFolderID !== "") {
        if (typeof body.parentFolderID !== "string") throw new TypeError("parentFolderID must be a string or null.");
        parentFolderID = body.parentFolderID;
    }

    if (typeof body.maxSize !== "number" || !Number.isFinite(body.maxSize) || body.maxSize < 0) {
        throw new TypeError("maxSize must be a non-negative number (bytes).");
    }
    if (!Number.isInteger(body.maxSize)) throw new TypeError("maxSize must be an integer number of bytes.");

    const dto: MintTokenDto = {
        name:           body.name,
        parentFolderID,
        maxSize:        body.maxSize,
        ttlSec:         DEFAULT_TTL_SEC,
    };

    if (body.contentType !== undefined && body.contentType !== "") {
        if (typeof body.contentType !== "string") throw new TypeError("contentType must be a string.");
        dto.contentType = body.contentType;
    }

    if (body.publicPath !== undefined && body.publicPath !== "") {
        if (typeof body.publicPath !== "string") throw new TypeError("publicPath must be a string.");
        assertValidPublicPath(body.publicPath);
        dto.publicPath = body.publicPath;
    }

    if (body.ttlSec !== undefined) {
        if (typeof body.ttlSec !== "number" || !Number.isInteger(body.ttlSec)) {
            throw new TypeError("ttlSec must be an integer number of seconds.");
        }
        if (body.ttlSec < MIN_TTL_SEC || body.ttlSec > MAX_TTL_SEC) {
            throw new Error(`ttlSec out of range (must be between ${MIN_TTL_SEC} and ${MAX_TTL_SEC}).`);
        }
        dto.ttlSec = body.ttlSec;
    }

    if (body.overwrite === true || body.overwrite === "true") dto.overwrite = true;

    return dto;
}
