export type EdgeHandler = (request: Request) => Response | Promise<Response>;
export type JsonRecord = Record<string, unknown>;

export type EmailTransport = {
    sendMail(input: JsonRecord): Promise<{ messageId?: string; response?: string }>;
};
