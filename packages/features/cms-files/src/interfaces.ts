export type NamespacePermission =
    | "files.read"
    | "files.write"
    | "files.delete"
    | "files.sign"
    | "files.publish"
    | "namespace.manage";

export interface NamespaceRecord {
    readonly id: string;
    readonly name: string;
    readonly defaultVisibility: "private" | "public";
    readonly createdAt: string;
    readonly createdBy: {
        readonly kind: "administrator" | "provider" | "system";
        readonly id: string;
    };
    readonly quota: { readonly maxBytes: number; readonly maxFiles: number };
}

export interface NamespaceKeyRecord {
    readonly id: string;
    readonly namespaceId: string;
    readonly verifier: string;
    readonly permissions: readonly NamespacePermission[];
    readonly createdAt: string;
    readonly expiresAt?: string;
    readonly revokedAt?: string;
}

export interface UploadRecord {
    readonly id: string;
    readonly namespaceId: string;
    readonly tokenVerifier: string;
    readonly blobKey: string;
    readonly name: string;
    readonly declaredMimeType?: string;
    readonly expectedSize: number;
    readonly visibility: "private" | "public";
    readonly imageProfile?: "thumbnail" | "responsive";
    readonly state: "pending" | "uploaded" | "completed";
    readonly createdAt: string;
    readonly expiresAt: string;
    readonly actualSize?: number;
    readonly contentHash?: string;
    readonly detectedMimeType?: string;
    readonly fileId?: string;
}

export interface FileRecord {
    readonly id: string;
    readonly namespaceId: string;
    readonly generation: string;
    readonly blobKey: string;
    readonly name: string;
    readonly size: number;
    readonly mimeType: string;
    readonly contentHash: string;
    readonly visibility: "private" | "public";
    readonly imageProfile?: "thumbnail" | "responsive";
    readonly createdAt: string;
    readonly updatedAt: string;
    readonly width?: number;
    readonly height?: number;
    readonly variants?: readonly FileVariant[];
}

export interface FileVariant {
    readonly profile: "thumbnail" | "responsive";
    readonly width: number;
    readonly height: number;
    readonly mimeType: "image/webp";
    readonly blobKey: string;
    readonly size: number;
}

export interface CmsFilesStore {
    createNamespace(namespace: NamespaceRecord, key: NamespaceKeyRecord): Promise<void>;
    getNamespace(id: string): Promise<NamespaceRecord | null>;
    deleteNamespace(id: string): Promise<void>;
    getKey(id: string): Promise<NamespaceKeyRecord | null>;
    listKeys(namespaceId: string): Promise<readonly NamespaceKeyRecord[]>;
    putKey(key: NamespaceKeyRecord): Promise<void>;
    putUpload(upload: UploadRecord): Promise<void>;
    getUpload(id: string): Promise<UploadRecord | null>;
    listExpiredUploads(before: string, limit: number): Promise<readonly UploadRecord[]>;
    deleteUpload(id: string): Promise<void>;
    putFile(file: FileRecord): Promise<void>;
    getFile(id: string, generation: string): Promise<FileRecord | null>;
    getLatestFile(id: string): Promise<FileRecord | null>;
    listFileGenerations(id: string): Promise<readonly FileRecord[]>;
    listFiles(namespaceId: string, offset: number, limit: number): Promise<readonly FileRecord[]>;
    deleteFile(id: string, generation: string): Promise<void>;
}

export interface FileReference {
    readonly fileId: string;
    readonly generation: string;
    readonly namespaceId: string;
    readonly mimeType: string;
    readonly size: number;
    readonly visibility: "private" | "public";
    readonly name: string;
    readonly width?: number;
    readonly height?: number;
    readonly url: string;
    readonly variants?: readonly {
        readonly width: number;
        readonly height: number;
        readonly profile: "thumbnail" | "responsive";
        readonly mimeType: "image/webp";
        readonly url: string;
    }[];
}

export interface FileDerivativeScheduler {
    enqueue(file: FileRecord): void;
}

export interface CmsFileRead {
    readonly file: FileRecord;
    readonly stream: ReadableStream<Uint8Array>;
    readonly status: 200 | 206;
    readonly contentLength: number;
    readonly contentRange?: string;
    readonly etag: string;
    readonly cacheControl: string;
    readonly contentType: string;
}
