import { describe, expect, mock, test } from "bun:test";
import { exportPKCS8, generateKeyPair, jwtVerify } from "jose";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { InMemoryGatewayRepository, seedProviders, type Provider } from "@bernouy/cms-gateway";
import DeliveryCms from "cms-delivery/DeliveryCms";

const provider = (): Provider => ({
    urn: "urn:secured",
    endpoints: [{
        urn: "urn:secured:get",
        method: "GET",
        targetUrl: "https://api.example.com/data",
        headers: [{
            name: "Authorization",
            source: {
                from: "jwt",
                signingKeyRef: "JWT_PRIVATE_KEY",
                alg: "RS256",
                claims: { aud: "public-api" },
                prefix: "Bearer ",
            },
        }],
    }],
});

describe("DeliveryCms gateway deps", () => {
    test("passes gatewayDeps to the public gateway proxy", async () => {
        const { privateKey, publicKey } = await generateKeyPair("RS256", { extractable: true });
        const privatePem = await exportPKCS8(privateKey);
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [provider()]);
        const fetchImpl = mock(async () => new Response("ok"));
        const runner = new CaptureRunner("/site");

        new DeliveryCms({
            runner,
            repository: {} as any,
            gateway,
            gatewayDeps: {
                fetchImpl,
                resolveSecret: async (ref) => ref === "JWT_PRIVATE_KEY" ? privatePem : undefined,
            },
        });

        const res = await runner.gatewayGet(new Request("http://local/site/.cms/gateway/secured/get"));
        expect(res.status).toBe(200);
        const auth = (fetchImpl.mock.calls[0]![1]!.headers as Headers).get("authorization") ?? "";
        const verified = await jwtVerify(auth.slice("Bearer ".length), publicKey, { algorithms: ["RS256"] });
        expect(verified.payload.aud).toBe("public-api");
    });

    test("keeps returning a clean 500 when gateway deps are absent", async () => {
        const gateway = new InMemoryGatewayRepository();
        await seedProviders(gateway, [provider()]);
        const runner = new CaptureRunner("/site");

        new DeliveryCms({ runner, repository: {} as any, gateway });

        const res = await runner.gatewayGet(new Request("http://local/site/.cms/gateway/secured/get"));
        expect(res.status).toBe(500);
        expect(await res.text()).toBe("jwt header requires a configured secret store");
    });
});

class CaptureRunner implements Runner {
    private readonly handlers = new Map<string, RouteHandler>();
    constructor(readonly basePath: string) {}
    gatewayGet(req: Request): Promise<Response> {
        return Promise.resolve(this.handlers.get("GET")!(req));
    }
    group(prefix: string, callback: (runner: Runner) => void): void {
        callback(new CaptureGroup(this.basePath + prefix, this.handlers));
    }
    addEndpoint(): void {}
    use(): void {}
    get(): void {}
    post(): void {}
    patch(): void {}
    delete(): void {}
    put(): void {}
    setDefaultEndpoint(): void {}
    getRequestIP(): string | undefined { return undefined; }
    removeRoutesByPathPrefix(): void {}
    start(): void {}
    stop(): void {}
}

class CaptureGroup extends CaptureRunner {
    constructor(basePath: string, private readonly shared: Map<string, RouteHandler>) {
        super(basePath);
    }
    override setDefaultEndpoint(method: "GET" | "POST" | "PUT" | "DELETE" | "PATCH" | "OPTIONS", handler: RouteHandler): void {
        this.shared.set(method, handler);
    }
}
