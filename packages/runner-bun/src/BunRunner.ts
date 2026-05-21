import type { Runner, RouteHandler, Middleware } from "@bernouy/core";
import { setRequestIP, getRequestIP as readRequestIP } from "@bernouy/core";

function urlJoin(...parts: string[]): string {
    return ("/" + parts.join("/")).replace(/\/+/g, "/") || "/";
}

function normalizePath(p: string): string {
    return p.length > 1 && p.endsWith("/") ? p.slice(0, -1) : p;
}

function pathUnderPrefix(pathname: string, prefix: string): boolean {
    if (prefix === "/") return true;
    return pathname === prefix || pathname.startsWith(prefix + "/");
}

export class BunRunner implements Runner {

    basePath: string = "/";

    private routes: Array<{
        method: string;
        path: string;
        handler: RouteHandler;
        middlewares: Middleware[];
    }> = [];

    private globalMiddlewares: Middleware[] = [];

    private server?: ReturnType<typeof Bun.serve>;

    /** The bound TCP port once `start()` has run (the OS-assigned one when
     *  started with `0`), or `undefined` before start / after stop. */
    get port(): number | undefined { return this.server?.port; }

    private defaultEndpoints: Array<{
        method: string;
        prefix: string;
        handler: RouteHandler;
        middlewares: Middleware[];
    }> = [];

    addEndpoint(method: string, path: string, handler: RouteHandler, middlewares: Middleware[] = []): void {
        this.routes.push({
            method,
            path: urlJoin(path),
            handler,
            middlewares,
        });
    }

    use(middleware: Middleware): void {
        this.globalMiddlewares.push(middleware);
    }

    group(prefix: string, callback: (runner: Runner) => void, middlewares: Middleware[] = []) {

        // normalize: strip trailing "/" so nested groups (e.g. parent="/cms"
        // + child="/" → "/cms/") don't leak the slash into basePath, which
        // would propagate into `{{BASE_PATH}}` substitutions and produce
        // double-slash asset URLs like `/cms//assets/foo.css`.
        const currentPrefix = normalizePath(urlJoin(prefix));
        const currentMiddlewares = middlewares;

        const scopedRunner: Runner = {
            ...this,
            basePath: currentPrefix,
            addEndpoint: (method, path, handler, middleware = []) => {
                this.addEndpoint(method, urlJoin(currentPrefix, path), handler, [...currentMiddlewares, ...middleware]);
            },
            get: (p, h, m) => scopedRunner.addEndpoint('GET', p, h, m),
            post: (p, h, m) => scopedRunner.addEndpoint('POST', p, h, m),
            put: (p, h, m) => scopedRunner.addEndpoint('PUT', p, h, m),
            delete: (p, h, m) => scopedRunner.addEndpoint('DELETE', p, h, m),
            patch: (p, h, m) => scopedRunner.addEndpoint('PATCH', p, h, m),

            group: (p, c, m = []) => {
                this.group(urlJoin(currentPrefix, p), c, [...currentMiddlewares, ...m]);
            },

            setDefaultEndpoint: (method, handler, middleware = []) => {
                this._registerDefaultEndpoint(method, currentPrefix, handler, [...currentMiddlewares, ...middleware]);
            },

            getRequestIP: (req) => this.getRequestIP(req),

            removeRoutesByPathPrefix: (prefix) => {
                this.removeRoutesByPathPrefix(urlJoin(currentPrefix, prefix));
            },

            stop: () => this.stop(),
        };

        callback(scopedRunner);
    }

    get(path: string, handler: RouteHandler, middlewares: Middleware[] = []) { this.addEndpoint('GET', path, handler, middlewares); }
    post(path: string, handler: RouteHandler, middlewares: Middleware[] = []) { this.addEndpoint('POST', path, handler, middlewares); }
    patch(path: string, handler: RouteHandler, middlewares: Middleware[] = []) { this.addEndpoint('PATCH', path, handler, middlewares); }
    delete(path: string, handler: RouteHandler, middlewares: Middleware[] = []) { this.addEndpoint('DELETE', path, handler, middlewares); }
    put(path: string, handler: RouteHandler, middlewares: Middleware[] = []) { this.addEndpoint('PUT', path, handler, middlewares); }

    setDefaultEndpoint(method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH' | 'OPTIONS', handler: RouteHandler, middlewares: Middleware[] = []): void {
        this._registerDefaultEndpoint(method, "/", handler, middlewares);
    }

    getRequestIP(req: Request): string | undefined {
        return readRequestIP(req);
    }

    removeRoutesByPathPrefix(prefix: string): void {
        const norm = normalizePath(prefix);
        const matches = (path: string): boolean =>
            path === norm || path.startsWith(norm + "/");
        this.routes = this.routes.filter(r => !matches(r.path));
        this.defaultEndpoints = this.defaultEndpoints.filter(d => !matches(d.prefix));
    }

    private _registerDefaultEndpoint(method: string, prefix: string, handler: RouteHandler, middlewares: Middleware[]): void {
        this.defaultEndpoints = this.defaultEndpoints.filter(d => !(d.method === method && d.prefix === prefix));
        this.defaultEndpoints.push({ method, prefix, handler, middlewares });
    }

    start(port: number = 3000): void {
        const self = this;

        this.server = Bun.serve({
            port,
            async fetch(request, server) {
                const peer = server.requestIP(request);
                if (peer) setRequestIP(request, peer.address);

                const url = new URL(request.url);
                const method = request.method;
                const pathname = normalizePath(url.pathname);

                const route = self.routes.find(r =>
                    r.method === method && self.matchPath(r.path, pathname)
                );

                const fallback = route ? null : self.defaultEndpoints
                    .filter(d => d.method === method && pathUnderPrefix(pathname, d.prefix))
                    .sort((a, b) => b.prefix.length - a.prefix.length)[0]
                    ?? null;

                const effective = route ?? fallback;

                if (!effective) {
                    return new Response("Not Found", { status: 404 });
                }

                const allMiddlewares = [...self.globalMiddlewares, ...effective.middlewares];

                let index = 0;
                const next = async (req: Request): Promise<Response> => {
                    if (index < allMiddlewares.length) {
                        const middleware = allMiddlewares[index++]!;
                        return middleware(req, () => next(req));
                    }
                    return effective.handler(req);
                };

                try {
                    return await next(request);
                } catch (e) {
                    console.error(e);
                    return new Response("Internal Server Error", { status: 500 });
                }
            },
        });

        console.log(`🚀 Server started on http://localhost:${this.server.port}`);
    }

    /** Stop the `Bun.serve` listener and free the port. Idempotent. */
    stop(): void {
        this.server?.stop(true);
        this.server = undefined;
    }

    private matchPath(routePath: string, requestPath: string): boolean {
        const route = normalizePath(routePath);
        if (route === requestPath) return true;

        const routeParts = route.split('/');
        const requestParts = requestPath.split('/');

        if (routeParts.length !== requestParts.length) return false;

        return routeParts.every((part, i) => part.startsWith(':') || part === requestParts[i]);
    }
}
