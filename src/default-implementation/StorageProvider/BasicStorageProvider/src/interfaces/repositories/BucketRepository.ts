import type { Bucket } from "../entities/Bucket";

export interface BucketRepository {
    create(bucket: Bucket): Promise<void>;
    get(id: string): Promise<Bucket | null>;
    update(id: string, patch: Partial<Omit<Bucket, "id" | "createdAt">>): Promise<void>;
    delete(id: string): Promise<void>;
    list(): Promise<Bucket[]>;
}
