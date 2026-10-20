/** Minimal authenticated CMS identity resolved from an opaque credential. */
export interface Subject {
    /** Stable opaque identifier; never an email address or display name. */
    identifier: string;
    /** Authentication email when the credential provider exposes one. */
    email?: string;
}
