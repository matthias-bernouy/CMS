export type EdgeHandler = (request: Request) => Response | Promise<Response>;
export type JsonRecord = Record<string, unknown>;
