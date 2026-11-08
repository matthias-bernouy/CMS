export class ResourceArchiveError extends TypeError {
    constructor(message: string, options?: ErrorOptions) {
        super(message, options);
    }
}

export function invalidResource(message: string, path: string): never {
    throw new ResourceArchiveError(`${path}: ${message}`);
}
