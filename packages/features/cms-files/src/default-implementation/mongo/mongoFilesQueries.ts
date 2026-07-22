import { escapeRegex } from "@bernouy/cms-content";
import type { Collection } from "mongodb";
import type { FilesItem, FilesListOptions, FilesPage } from "cms-files/interfaces/CmsFilesMetadataRepository";
import { fromDocument, type FilesItemDocument } from "./mongoFilesDocuments";

export async function listMongoChildren(
    collection: Collection<FilesItemDocument>,
    parentId: string | null,
    options: FilesListOptions,
): Promise<FilesPage> {
    const filter: Record<string, unknown> = { parentId };
    if (options.accept) {
        filter.type = { $in: options.accept };
    }
    if (options.search) {
        filter.name = { $regex: escapeRegex(options.search), $options: "i" };
    }
    const sort = { [options.sortBy ?? "name"]: options.sortOrder === "desc" ? -1 : 1 } as Record<string, 1 | -1>;
    const total = await collection.countDocuments(filter);
    let cursor = collection.find(filter).sort(sort);
    if (options.pagination) {
        cursor = cursor.skip((options.pagination.page - 1) * options.pagination.limit).limit(options.pagination.limit);
    }
    const documents = await cursor.toArray();
    const page = options.pagination?.page ?? 1;
    const limit = options.pagination?.limit ?? total;
    return {
        items: documents.map(fromDocument),
        total,
        page,
        limit,
        hasMore: (page - 1) * limit + documents.length < total,
    };
}

export async function findMongoItemByPath(
    collection: Collection<FilesItemDocument>,
    path: string,
): Promise<FilesItem | null> {
    const segments = path
        .split("/")
        .map((segment) => segment.trim())
        .filter(Boolean);
    let parentId: string | null = null;
    let document: FilesItemDocument | null = null;
    for (const segment of segments) {
        document = await collection.findOne({ parentId, name: segment });
        if (!document) {
            return null;
        }
        parentId = document._id;
    }
    return document ? fromDocument(document) : null;
}

export async function listMongoSubtree(
    collection: Collection<FilesItemDocument>,
    collectionName: string,
    folderId: string,
): Promise<FilesItem[]> {
    const documents = await collection
        .aggregate<FilesItemDocument>([
            { $match: { _id: folderId } },
            {
                $graphLookup: {
                    from: collectionName,
                    startWith: "$_id",
                    connectFromField: "_id",
                    connectToField: "parentId",
                    as: "descendants",
                },
            },
            { $unwind: "$descendants" },
            { $replaceRoot: { newRoot: "$descendants" } },
        ])
        .toArray();
    return documents.map(fromDocument);
}
