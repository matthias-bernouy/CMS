export interface ProviderIdentityScope {
    readonly providerId: string;
}

/** One stable user alias per provider, shared across its sites and installations. */
export interface ProviderIdentityService {
    getOrCreate(scope: ProviderIdentityScope, cmsSubjectId: string): Promise<string>;
    resolve(scope: ProviderIdentityScope, providerSubjectId: string | number): Promise<string | null>;
}
