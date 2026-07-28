import { field, RepositoryFormError } from "./fields";

const MAX_CANDIDATE_BYTES = 32 * 1_024 * 1_024;

export async function readRepositoryCandidateFile(form: HTMLFormElement): Promise<File> {
    const input = field(form, "candidate");
    if (!(input instanceof HTMLInputElement) || input.type !== "file") {
        throw new RepositoryFormError("The candidate upload field is unavailable.");
    }
    const file = input.files?.[0];
    if (!file) {
        throw new RepositoryFormError("Select a candidate JSON file.");
    }
    if (file.size < 1 || file.size > MAX_CANDIDATE_BYTES) {
        throw new RepositoryFormError("The candidate JSON file must be between 1 byte and 32 MiB.");
    }
    try {
        const value = JSON.parse(await file.text()) as unknown;
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new TypeError("Candidate document must be an object");
        }
    } catch {
        throw new RepositoryFormError("Select a valid candidate JSON document.");
    }
    return file;
}
