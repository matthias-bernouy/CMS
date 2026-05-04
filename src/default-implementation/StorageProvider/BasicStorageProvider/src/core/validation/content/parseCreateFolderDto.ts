import { assertValidItemName } from "./name";

export type FolderCreateDto = {
    name: string;
    parentFolderID: string | null;
};

export function parseFolderCreateDto(body: Record<string, unknown>): FolderCreateDto {
    assertValidItemName(body.name);
    const name = body.name;

    let parentFolderID: string | null = null;
    if (body.parentFolderID !== undefined && body.parentFolderID !== "" && body.parentFolderID !== null) {
        if (typeof body.parentFolderID !== "string") throw new TypeError("parentFolderID must be a string.");
        parentFolderID = body.parentFolderID;
    }

    return { name, parentFolderID };
}
