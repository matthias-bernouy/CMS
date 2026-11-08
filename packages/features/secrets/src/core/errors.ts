export class CmsSecretConflict extends Error {}

export class CmsSecretNotFound extends Error {}

export class CmsSecretNotAuthorized extends Error {
    constructor() {
        super("secret namespace credential is not authorized");
    }
}
