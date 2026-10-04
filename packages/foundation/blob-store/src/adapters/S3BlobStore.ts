import { S3Client } from "bun";
import {
    assertBlobKey,
    assertBlobRange,
    type BlobInput,
    type BlobReadOptions,
    type BlobStore,
} from "blob-store/core/contracts";

export type S3BlobStoreConfig = {
    bucket: string;
    accessKeyId: string;
    secretAccessKey: string;
    region?: string;
    endpoint?: string;
    virtualHostedStyle?: boolean;
    prefix?: string;
};

export class S3BlobStore implements BlobStore {
    private readonly client: S3Client;
    private readonly prefix: string;

    constructor(config: S3BlobStoreConfig) {
        const { prefix, ...s3 } = config;
        this.client = new S3Client(s3);
        this.prefix = prefix ?? "";
    }

    async put(key: string, data: BlobInput): Promise<{ size: number }> {
        return { size: await this.client.write(this.key(key), new Response(data as BodyInit)) };
    }

    async get(key: string, options: BlobReadOptions = {}): Promise<ReadableStream<Uint8Array> | null> {
        const file = this.client.file(this.key(key));
        if (!(await file.exists())) {
            return null;
        }
        if (!options.range) {
            return file.stream();
        }
        assertBlobRange(options.range, file.size);
        return file.slice(options.range.start, options.range.end + 1).stream();
    }

    async head(key: string): Promise<{ size: number } | null> {
        const file = this.client.file(this.key(key));
        return (await file.exists()) ? { size: file.size } : null;
    }

    async delete(key: string): Promise<void> {
        await this.client.file(this.key(key)).delete();
    }

    async exists(key: string): Promise<boolean> {
        return (await this.head(key)) !== null;
    }

    private key(key: string): string {
        assertBlobKey(key);
        return this.prefix + key;
    }
}
