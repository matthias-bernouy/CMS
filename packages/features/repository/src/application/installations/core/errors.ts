/** Private domain refusal; the feature owns classification and the surface owns public copy. */
export class InstallationError extends Error {
    constructor(
        readonly code: string,
        cause?: unknown,
    ) {
        super("The installation request was refused.", { cause });
    }
}
