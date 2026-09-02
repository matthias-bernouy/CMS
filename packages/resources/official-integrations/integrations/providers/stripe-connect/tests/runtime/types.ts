export type EdgeHandler = (request: Request) => Response | Promise<Response>;

export type JsonRecord = Record<string, unknown>;

export type StripeRequestRecord = {
    method: string;
    pathname: string;
    searchParams: Array<[string, string]>;
    idempotencyKey: string | null;
    stripeAccount: string | null;
};
