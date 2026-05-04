import { uploadFile } from "../../../core/upload/uploadFile";
import { wrapAdmin } from "../../../core/admin/wrapAdmin";

export default wrapAdmin(async (req, provider) => {
    const search = new URL(req.url).searchParams;
    const bucketId = search.get("bucketId");
    if (!bucketId) throw new TypeError("Missing 'bucketId' query param.");

    const form = await req.formData();
    const file = form.get("file");
    if (!(file instanceof File)) throw new TypeError("Missing 'file' multipart field.");

    const nameField = form.get("name");
    const name = (typeof nameField === "string" && nameField.length > 0) ? nameField : file.name;

    const parentField = form.get("parentFolderID") ?? search.get("folderID");
    const parentFolderID = (typeof parentField === "string" && parentField.length > 0) ? parentField : null;

    const publicPathField = form.get("publicPath");
    const publicPath = (typeof publicPathField === "string" && publicPathField.length > 0) ? publicPathField : undefined;

    return uploadFile(provider, bucketId, {
        name,
        mimeType: file.type || "application/octet-stream",
        body: file.stream(),
        parentFolderID,
        publicPath,
    });
});
