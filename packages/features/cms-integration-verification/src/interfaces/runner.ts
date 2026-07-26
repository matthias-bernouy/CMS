export type VerificationPolicyIdentity = Readonly<{
    name: string;
    version: string;
}>;

export type VerificationRunnerRequirement = Readonly<{
    name: string;
    versionRange: string;
}>;

export type PinnedVerificationRunnerIdentity = Readonly<{
    name: string;
    version: string;
    imageDigest: string;
}>;
