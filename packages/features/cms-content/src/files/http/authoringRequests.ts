import type { BlobStore } from "@bernouy/blob-store";
import { readBoundedFormData } from "@bernouy/http-runner";
import { uploadFile } from "cms-content/files/core/lifecycle/uploadFile";
import { updateFileContent } from "cms-content/files/core/lifecycle/updateFileContent";
import { MAX_UPLOAD_BYTES } from "cms-content/files/core/validation/validation";
import type { CmsFileMutationJournal } from "cms-content/files/interfaces/CmsFileMutationJournal";
import type { CmsFilesMetadataRepository, FileItem } from "cms-content/files/interfaces/CmsFilesMetadataRepository";

const MAX_MULTIPART_OVERHEAD_BYTES = 1024 * 1024;

export type AuthorFileMutationDeps = Readonly<{
    metadata: CmsFilesMetadataRepository;
    blob: BlobStore;
    mutations?: CmsFileMutationJournal;
    afterContentUpdated?: (file: FileItem) => Promise<void>;
}>;

/** Handle the authenticated CMS multipart upload transport. */
export async function uploadAuthorFileRequest(request: Request, deps: AuthorFileMutationDeps): Promise<Response> {
    const form = await boundedFileForm(request);
    const file = requiredFile(form);
    const parentId = nullableText(form.get("parentId"));
    const id = optionalText(form.get("id"));
    const item = await uploadFile(deps.metadata, deps.blob, file, parentId, id, deps.mutations);
    return Response.json(item, { status: 201, headers: noStoreHeaders() });
}

/** Handle the authenticated CMS multipart in-place content replacement transport. */
export async function replaceAuthorFileRequest(request: Request, deps: AuthorFileMutationDeps): Promise<Response> {
    const form = await boundedFileForm(request);
    const file = requiredFile(form);
    const id = optionalText(form.get("id"));
    if (!id) {
        throw invalidField("id", "A file id is required.");
    }
    const item = await updateFileContent(deps.metadata, deps.blob, id, file, deps.mutations);
    if (!item) {
        return Response.json(
            { error: "File not found", code: "NOT_FOUND" },
            { status: 404, headers: noStoreHeaders() },
        );
    }
    await deps.afterContentUpdated?.(item);
    return Response.json(item, { headers: noStoreHeaders() });
}

async function boundedFileForm(request: Request): Promise<FormData> {
    return readBoundedFormData(request, MAX_UPLOAD_BYTES + MAX_MULTIPART_OVERHEAD_BYTES);
}

function requiredFile(form: FormData): File {
    const file = form.get("file");
    if (!(file instanceof File)) {
        throw invalidField("file", "A multipart file is required.");
    }
    return file;
}

function optionalText(value: FormDataEntryValue | null): string | undefined {
    return typeof value === "string" && value.length ? value : undefined;
}

function nullableText(value: FormDataEntryValue | null): string | null {
    const text = optionalText(value);
    return text && text !== "null" ? text : null;
}

function invalidField(field: string, message: string): Error {
    return Object.assign(new Error(message), { status: 422, publicCode: "INVALID_INPUT", field });
}

function noStoreHeaders(): HeadersInit {
    return { "cache-control": "private, no-store" };
}
