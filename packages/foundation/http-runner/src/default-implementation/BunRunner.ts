import { getRequestIP as readRequestIP } from "http-runner/core/request/ip";
import type { Middleware, RouteHandler, Runner } from "http-runner/interfaces/Runner";
import { dispatchBunRunnerRequest, type RegisteredDefaultEndpoint, type RegisteredRoute } from "./bunRequestDispatch";
import { stopServerGracefully } from "./gracefulServerStop";
import { normalizePath, urlJoin } from "./runnerPaths";

export class BunRunner implements Runner {
    basePath: string = "/";

    private routes: RegisteredRoute[] = [];

    private globalMiddlewares: Middleware[] = [];

    private server?: ReturnType<typeof Bun.serve>;

    /** The bound TCP port once `start()` has run (the OS-assigned one when
     *  started with `0`), or `undefined` before start / after stop. */
    get port(): number | undefined {
        return this.server?.port;
    }

    private defaultEndpoints: RegisteredDefaultEndpoint[] = [];

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
            get: (p, h, m) => scopedRunner.addEndpoint("GET", p, h, m),
            post: (p, h, m) => scopedRunner.addEndpoint("POST", p, h, m),
            put: (p, h, m) => scopedRunner.addEndpoint("PUT", p, h, m),
            delete: (p, h, m) => scopedRunner.addEndpoint("DELETE", p, h, m),
            patch: (p, h, m) => scopedRunner.addEndpoint("PATCH", p, h, m),

            // `{ ...this }` copies instance fields but NOT prototype methods, so
            // `use` would be missing from the scoped runner even though it's on
            // the `Runner` contract — `r.use(mw)` inside a group() callback would
            // throw "r.use is not a function". Register against the root.
            use: (mw) => this.use(mw),

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
            stopGracefully: (timeoutMs) => this.stopGracefully(timeoutMs),
        };

        callback(scopedRunner);
    }

    get(path: string, handler: RouteHandler, middlewares: Middleware[] = []) {
        this.addEndpoint("GET", path, handler, middlewares);
    }
    post(path: string, handler: RouteHandler, middlewares: Middleware[] = []) {
        this.addEndpoint("POST", path, handler, middlewares);
    }
    patch(path: string, handler: RouteHandler, middlewares: Middleware[] = []) {
        this.addEndpoint("PATCH", path, handler, middlewares);
    }
    delete(path: string, handler: RouteHandler, middlewares: Middleware[] = []) {
        this.addEndpoint("DELETE", path, handler, middlewares);
    }
    put(path: string, handler: RouteHandler, middlewares: Middleware[] = []) {
        this.addEndpoint("PUT", path, handler, middlewares);
    }

    setDefaultEndpoint(
        method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        handler: RouteHandler,
        middlewares: Middleware[] = [],
    ): void {
        this._registerDefaultEndpoint(method, "/", handler, middlewares);
    }

    getRequestIP(req: Request): string | undefined {
        return readRequestIP(req);
    }

    removeRoutesByPathPrefix(prefix: string): void {
        const norm = normalizePath(prefix);
        const matches = (path: string): boolean => path === norm || path.startsWith(norm + "/");
        this.routes = this.routes.filter((r) => !matches(r.path));
        this.defaultEndpoints = this.defaultEndpoints.filter((d) => !matches(d.prefix));
    }

    private _registerDefaultEndpoint(
        method: string,
        prefix: string,
        handler: RouteHandler,
        middlewares: Middleware[],
    ): void {
        this.defaultEndpoints = this.defaultEndpoints.filter((d) => !(d.method === method && d.prefix === prefix));
        this.defaultEndpoints.push({ method, prefix, handler, middlewares });
    }

    start(port: number = 3000): void {
        const self = this;

        this.server = Bun.serve({
            port,
            fetch: (request, server) =>
                dispatchBunRunnerRequest(request, server, self.routes, self.defaultEndpoints, self.globalMiddlewares),
        });

        console.log(`🚀 Server started on http://localhost:${this.server.port}`);
    }

    /** Stop the `Bun.serve` listener and free the port. Idempotent. */
    stop(): void {
        this.server?.stop(true);
        this.server = undefined;
    }

    /** Stop accepting traffic, wait for active requests, then force-close after the bounded grace period. */
    async stopGracefully(timeoutMs?: number): Promise<void> {
        const server = this.server;
        this.server = undefined;
        await stopServerGracefully(server, timeoutMs);
    }
}
