export interface AccessAdministratorState {
    readonly sub: string;
    readonly enabled: boolean;
    readonly revision: number;
    readonly bootstrap: boolean;
}
/** Host-selected authorization/identity ports; membership records do not own grants. */
export interface AccessGovernance {
    readonly administrators: {
        canRevoke(sub: string): Promise<boolean>;
        get(sub: string): Promise<AccessAdministratorState>;
        set(sub: string, enabled: boolean, expectedRevision: number): Promise<AccessAdministratorState>;
    };
    readonly identities: { resolve(issuer: { readonly providerId: string }, subject: string): Promise<string | null> };
}
