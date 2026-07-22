import type { Collection, OptionalUnlessRequiredId } from "mongodb";
import { randomUUIDv7 } from "bun";
import type { FileItem, FolderItem, NewFile, NewFolder } from "cms-files/interfaces/CmsFilesMetadataRepository";
import { fileNameClashOr, fromDocument, type FilesItemDocument } from "./mongoFilesDocuments";

export async function createMongoFolder(
    collection: Collection<FilesItemDocument>,
    input: NewFolder,
): Promise<FolderItem> {
    await assertMongoParent(collection, input.parentId);
    const now = new Date();
    const document: FilesItemDocument = {
        _id: randomUUIDv7(),
        type: "folder",
        name: input.name,
        parentId: input.parentId,
        createdAt: now,
        updatedAt: now,
    };
    await insertMongoFileItem(collection, document);
    return fromDocument(document) as FolderItem;
}

export async function createMongoFile(collection: Collection<FilesItemDocument>, input: NewFile): Promise<FileItem> {
    await assertMongoParent(collection, input.parentId);
    const now = new Date();
    if (input.id) {
        try {
            const document = await collection.findOneAndUpdate(
                { _id: input.id },
                {
                    $set: {
                        type: "file",
                        name: input.name,
                        parentId: input.parentId,
                        size: input.size,
                        mimeType: input.mimeType,
                        contentHash: input.contentHash,
                        updatedAt: now,
                    },
                    $setOnInsert: { createdAt: now },
                },
                { upsert: true, returnDocument: "after" },
            );
            return fromDocument(document!) as FileItem;
        } catch (error) {
            throw fileNameClashOr(error);
        }
    }
    const document: FilesItemDocument = {
        _id: randomUUIDv7(),
        type: "file",
        name: input.name,
        parentId: input.parentId,
        size: input.size,
        mimeType: input.mimeType,
        contentHash: input.contentHash,
        createdAt: now,
        updatedAt: now,
    };
    await insertMongoFileItem(collection, document);
    return fromDocument(document) as FileItem;
}

export async function insertMongoFileItem(
    collection: Collection<FilesItemDocument>,
    document: FilesItemDocument,
): Promise<void> {
    try {
        await collection.insertOne(document as OptionalUnlessRequiredId<FilesItemDocument>);
    } catch (error) {
        throw fileNameClashOr(error);
    }
}

export async function assertMongoParent(
    collection: Collection<FilesItemDocument>,
    parentId: string | null,
): Promise<void> {
    if (parentId === null) {
        return;
    }
    const parent = await collection.findOne({ _id: parentId });
    if (!parent || parent.type !== "folder") {
        throw new Error("destination folder not found");
    }
}

export async function assertMongoMoveOutsideSubtree(
    collection: Collection<FilesItemDocument>,
    folderId: string,
    targetParentId: string,
): Promise<void> {
    let currentId: string | null = targetParentId;
    while (currentId !== null) {
        if (currentId === folderId) {
            throw new Error("cannot move a folder into its own subtree");
        }
        currentId = (await collection.findOne({ _id: currentId }))?.parentId ?? null;
    }
}
