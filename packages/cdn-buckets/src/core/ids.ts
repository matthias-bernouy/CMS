/** Opaque, URL-safe id used for files, folders, credentials, pre-signed tokens. */
export function generateId(): string {
    return crypto.randomUUID().replace(/-/g, "");
}
