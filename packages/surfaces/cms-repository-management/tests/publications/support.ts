import type { RouteHandler, Runner } from "@bernouy/http-runner";

export class PublicationTestRunner implements Partial<Runner> {
    readonly basePath = "/";
    private readonly routes = new Map<string, RouteHandler>();

    post(path: string, handler: RouteHandler): void {
        this.routes.set(`POST ${path}`, handler);
    }

    async handle(path: string, init: RequestInit): Promise<Response> {
        const pathname = new URL(path, "http://localhost").pathname;
        const method = init.method ?? "GET";
        const handler = this.routes.get(`${method} ${pathname}`);
        if (!handler) {
            throw new Error(`missing handler for ${method} ${pathname}`);
        }
        return await handler(new Request(`http://localhost${path}`, init));
    }
}

export async function responseJson(response: Response): Promise<Record<string, unknown>> {
    return response.json() as Promise<Record<string, unknown>>;
}
