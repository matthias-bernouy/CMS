export type InstanceCredential = Readonly<{
    instanceId: string;
    keyId: string;
    tokenHash: string;
    secretKey: string;
    enabled: boolean;
    revision: number;
    createdAt: string;
    updatedAt: string;
}>;

export interface InstanceCredentialStore {
    init(): Promise<void>;
    put(credential: Omit<InstanceCredential, "revision" | "createdAt" | "updatedAt">): Promise<InstanceCredential>;
    getByKeyId(keyId: string): Promise<InstanceCredential | null>;
    getByTokenHash(tokenHash: string): Promise<InstanceCredential | null>;
    disable(instanceId: string, expectedRevision: number): Promise<void>;
}
