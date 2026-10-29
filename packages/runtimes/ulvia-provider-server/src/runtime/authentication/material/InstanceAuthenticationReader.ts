import type { ProviderInstanceRecord } from "@bernouy/ulvia-provider";

export type AuthenticationSelector = Readonly<{
    field: "accessTokenHash" | "invocationKeyId";
    value: string;
}>;

export type AuthenticationSecrets = Readonly<{
    instanceAccessToken: string;
    invocationSecret: string;
}>;

export type InstanceAuthenticationMaterial = Readonly<{
    instance: ProviderInstanceRecord;
    secrets: AuthenticationSecrets;
}>;

/** Each read must freshly verify credential activity and instance readiness. */
export interface InstanceAuthenticationReader {
    read(selector: AuthenticationSelector): Promise<InstanceAuthenticationMaterial | null>;
}
