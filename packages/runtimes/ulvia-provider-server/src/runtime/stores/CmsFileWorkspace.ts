import type { CmsFilesService, FileReference } from "@bernouy/cms-files";
import type { SecretStore } from "@bernouy/secret-store";
import type { CmsFileWorkspace as CmsFileWorkspacePort } from "@bernouy/ulvia-provider";

const CREDENTIALS_KEY = "CMS_FILES_WORKSPACE";

type WorkspaceCredentials = Readonly<{ namespaceId: string; namespaceKey: string }>;

export class CmsFileWorkspace implements CmsFileWorkspacePort {
    #credentialsPromise?: Promise<WorkspaceCredentials>;

    constructor(
        private readonly files: CmsFilesService,
        private readonly secrets: SecretStore,
    ) {}

    async get(input: { offset?: number; limit?: number }) {
        const credentials = await this.#credentials();
        const [namespace, files] = await Promise.all([
            this.files.getNamespace(credentials.namespaceId, credentials.namespaceKey),
            this.files.listFiles({ ...credentials, ...input }),
        ]);
        return { namespace, ...files };
    }

    async createUpload(input: {
        filename: string;
        size: number;
        contentType?: string;
        visibility?: "private" | "public";
        imageProfile?: "thumbnail" | "responsive";
        fileId?: string;
    }) {
        const credentials = await this.#credentials();
        return this.files.createUpload({
            ...credentials,
            filename: input.filename,
            size: input.size,
            ...(input.contentType ? { mimeType: input.contentType } : {}),
            ...(input.visibility ? { visibility: input.visibility } : {}),
            ...(input.imageProfile ? { imageProfile: input.imageProfile } : {}),
            ...(input.fileId ? { fileId: input.fileId } : {}),
        });
    }

    async completeUpload(uploadId: string): Promise<FileReference> {
        const credentials = await this.#credentials();
        return this.files.completeUpload(credentials.namespaceId, credentials.namespaceKey, uploadId);
    }

    async updateFile(fileId: string, name: string): Promise<FileReference> {
        const credentials = await this.#credentials();
        return this.files.updateFile({ ...credentials, fileId, name });
    }

    async setFileVisibility(fileId: string, visibility: "private" | "public"): Promise<FileReference> {
        const credentials = await this.#credentials();
        return this.files.setFileVisibility({ ...credentials, fileId, visibility });
    }

    async signFile(fileId: string, generation: string, expiresInSeconds: number) {
        const credentials = await this.#credentials();
        return this.files.signFile({ ...credentials, fileId, generation, expiresInSeconds });
    }

    async deleteFile(fileId: string): Promise<void> {
        const credentials = await this.#credentials();
        await this.files.deleteFile(credentials.namespaceId, credentials.namespaceKey, fileId);
    }

    #credentials(): Promise<WorkspaceCredentials> {
        this.#credentialsPromise ??= this.#loadOrCreateCredentials();
        return this.#credentialsPromise;
    }

    async #loadOrCreateCredentials(): Promise<WorkspaceCredentials> {
        const stored = await this.secrets.get(CREDENTIALS_KEY);
        if (stored) {
            return parseCredentials(stored);
        }
        const created = await this.files.createNamespace({
            name: "Site files",
            defaultVisibility: "private",
            createdBy: { kind: "system", id: "ulvia.cms.files.workspace" },
        });
        const credentials = { namespaceId: created.namespaceId, namespaceKey: created.namespaceKey };
        await this.secrets.set(CREDENTIALS_KEY, JSON.stringify(credentials));
        return credentials;
    }
}

function parseCredentials(value: string): WorkspaceCredentials {
    const parsed: unknown = JSON.parse(value);
    if (
        !parsed ||
        typeof parsed !== "object" ||
        typeof (parsed as Partial<WorkspaceCredentials>).namespaceId !== "string" ||
        typeof (parsed as Partial<WorkspaceCredentials>).namespaceKey !== "string"
    ) {
        throw new Error("CMS file workspace credentials are invalid");
    }
    return parsed as WorkspaceCredentials;
}
