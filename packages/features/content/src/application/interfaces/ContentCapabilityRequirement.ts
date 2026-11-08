/** A declared dependency constrains execution; it never grants invocation authority. */
export interface ContentCapabilityRequirement {
    readonly contractId: string;
    readonly capabilityId: string;
    readonly versionRange: string;
}
