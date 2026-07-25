import { setRequestIP, type RouteHandler, type Runner } from "@bernouy/http-runner";

export class TestRunner implements Partial<Runner> {
    readonly basePath = "/";
    private readonly routes = new Map<string, RouteHandler>();

    get(path: string, handler: RouteHandler): void {
        this.addEndpoint("GET", path, handler);
    }

    addEndpoint(method: string, path: string, handler: RouteHandler): void {
        this.routes.set(`${method} ${path}`, handler);
    }

    async handle(path: string, init: RequestInit = {}, peer?: string): Promise<Response> {
        const pathname = new URL(path, "http://localhost").pathname;
        const method = init.method ?? "GET";
        const handler = this.routes.get(`${method} ${pathname}`);
        if (!handler) {
            throw new Error(`missing handler for ${method} ${pathname}`);
        }
        const request = new Request(`http://localhost${path}`, init);
        if (peer) {
            setRequestIP(request, peer);
        }
        return handler(request) as Promise<Response>;
    }
}

export async function json(response: Response): Promise<any> {
    return response.json();
}
