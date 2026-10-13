export type InstanceCredential = Readonly<{
    instanceId: string;
    invocationKeyId: string;
    accessTokenHash: string;
    secretKey: string;
    enabled: boolean;
    revision: number;
    createdAt: string;
    updatedAt: string;
}>;

export interface InstanceCredentialStore {
    init(): Promise<void>;
    put(credential: Omit<InstanceCredential, "revision" | "createdAt" | "updatedAt">): Promise<InstanceCredential>;
    getByInstanceId(instanceId: string): Promise<InstanceCredential | null>;
    getByInvocationKeyId(keyId: string): Promise<InstanceCredential | null>;
    getByAccessTokenHash(tokenHash: string): Promise<InstanceCredential | null>;
    disable(instanceId: string, expectedRevision: number): Promise<void>;
}
