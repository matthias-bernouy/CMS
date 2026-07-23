export class HttpError extends Error {
    constructor(
        readonly status: number,
        message: string,
    ) {
        super(message);
    }
}

export class ProviderHttpError extends HttpError {
    constructor(
        readonly providerStatus: number,
        message: string,
    ) {
        super(502, message);
    }
}
