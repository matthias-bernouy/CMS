import { field, RepositoryFormError } from "./fields";

const MAX_PACKAGE_BYTES = 32 * 1_024 * 1_024;

export async function readRepositoryPackageFile(form: HTMLFormElement): Promise<File> {
    const input = field(form, "package");
    if (!(input instanceof HTMLInputElement) || input.type !== "file") {
        throw new RepositoryFormError("The package upload field is unavailable.");
    }
    const file = input.files?.[0];
    if (!file) {
        throw new RepositoryFormError("Select a package JSON file.");
    }
    if (file.size < 1) {
        throw new RepositoryFormError("The package JSON file is empty.");
    }
    if (file.size > MAX_PACKAGE_BYTES) {
        throw new RepositoryFormError("The package JSON file exceeds the 32 MiB upload limit.");
    }
    try {
        const value = JSON.parse(await file.text()) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("Package document must be an object");
        }
    } catch {
        throw new RepositoryFormError("Select a valid package JSON document.");
    }
    return file;
}
