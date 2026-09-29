export interface InstallationIdentityScope {
    readonly siteId: string;
    readonly installationId: string;
}

/** The provider sees only the alias minted for this site and installation. */
export interface InstallationIdentityService {
    getOrCreate(scope: InstallationIdentityScope, cmsSubjectId: string): Promise<string>;
    resolve(scope: InstallationIdentityScope, providerSubjectId: string): Promise<string | null>;
    revoke(scope: InstallationIdentityScope): Promise<void>;
}
