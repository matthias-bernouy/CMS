import { describe, expect, spyOn, test } from "bun:test";
import { InMemoryAuthentication } from "@bernouy/cms-auth";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import type { Middleware, RouteHandler, Runner } from "@bernouy/http-runner";
import { ControlCms } from "cms-control/ControlCms";
import type { CMS_ROLES } from "types/roles";

class NoopRunner implements Runner {
    readonly basePath = "/";

    addEndpoint(
        _method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        _path: string,
        _handler: RouteHandler,
        _middlewares: Middleware[] = [],
    ): void {}

    use(_middleware: Middleware): void {}

    group(_prefix: string, callback: (runner: Runner) => void, _middlewares: Middleware[] = []): void {
        callback(this);
    }

    get(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
        this.addEndpoint("GET", path, handler, middlewares);
    }

    post(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
        this.addEndpoint("POST", path, handler, middlewares);
    }

    put(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
        this.addEndpoint("PUT", path, handler, middlewares);
    }

    patch(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
        this.addEndpoint("PATCH", path, handler, middlewares);
    }

    delete(path: string, handler: RouteHandler, middlewares?: Middleware[]): void {
        this.addEndpoint("DELETE", path, handler, middlewares);
    }

    setDefaultEndpoint(
        _method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS",
        _handler: RouteHandler,
        _middlewares: Middleware[] = [],
    ): void {}

    getRequestIP(_request: Request): string | undefined {
        return undefined;
    }

    removeRoutesByPathPrefix(_prefix: string): void {}
    start(_port?: number): void {}
    stop(): void {}
}

function createControl(): ControlCms {
    return new ControlCms(
        new NoopRunner(),
        new InMemoryCmsRepository(),
        new InMemoryAuthentication<CMS_ROLES>({ role: "admin" }),
    );
}

function deferred(): { promise: Promise<void>; resolve: () => void } {
    let resolve!: () => void;
    const promise = new Promise<void>((done) => {
        resolve = done;
    });
    return { promise, resolve };
}

describe("Control endpoint discovery readiness", () => {
    test.failing("keeps ControlCms.ready pending until endpoint discovery completes", async () => {
        const started = deferred();
        const release = deferred();
        const finished = deferred();
        const scan = spyOn(Bun.Glob.prototype, "scan").mockImplementation(() => (async function* () {
            started.resolve();
            await release.promise;
            finished.resolve();
        })());

        let readySettled = false;
        try {
            const cms = createControl();
            const ready = cms.ready.finally(() => {
                readySettled = true;
            });

            await started.promise;
            await Promise.resolve();
            expect(readySettled).toBe(false);

            release.resolve();
            await ready;
            expect(readySettled).toBe(true);
        } finally {
            release.resolve();
            await finished.promise;
            scan.mockRestore();
        }
    });

    test.failing("rejects ControlCms.ready when endpoint discovery fails", async () => {
        const failure = new Error("endpoint discovery failed");
        const started = deferred();
        const release = deferred();
        const finished = deferred();
        let throwFailure = true;
        const scan = spyOn(Bun.Glob.prototype, "scan").mockImplementation(() => (async function* () {
            started.resolve();
            await release.promise;
            try {
                if (throwFailure) throw failure;
            } finally {
                finished.resolve();
            }
        })());

        try {
            const cms = createControl();
            let readySettled = false;
            void cms.ready.then(
                () => { readySettled = true; },
                () => { readySettled = true; },
            );

            await started.promise;
            await Promise.resolve();

            // HEAD drops the discovery promise. Avoid manufacturing an
            // unhandled rejection in that known-broken case; the target
            // implementation keeps `ready` pending here and receives the
            // sentinel rejection below.
            if (readySettled) throwFailure = false;
            release.resolve();

            await expect(cms.ready).rejects.toBe(failure);
        } finally {
            release.resolve();
            await finished.promise;
            scan.mockRestore();
        }
    });
});
