export type ProviderCredentialRecord = {
    installationId: string;
    credentialRef: string;
    pendingUntil?: number;
    installationDigest?: string;
};
export interface ProviderAccessStore {
    findCredential(hash: string): Promise<ProviderCredentialRecord | null>;
    registerCredential(hash: string, installationId: string, credentialRef: string): Promise<void>;
    registerPendingCredential(hash: string, value: Required<ProviderCredentialRecord>): Promise<void>;
    hasPendingCredential(installationId: string, installationDigest: string, now: number): Promise<boolean>;
    consume(source: string, bytes: number, limits: { calls: number; bytes: number }): Promise<boolean>;
}
