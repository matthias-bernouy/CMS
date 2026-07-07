import type { Runner } from "@bernouy/http-runner";
import type { IntegrationDefinitionRepository } from "@bernouy/cms-integrations";

export type RepositoryCmsConfig = {
    runner: Runner;
    integrationCatalog: IntegrationDefinitionRepository;
};

export class RepositoryCms {
    private readonly runner: Runner;
    private readonly integrationCatalog: IntegrationDefinitionRepository;

    constructor(config: RepositoryCmsConfig) {
        this.runner = config.runner;
        this.integrationCatalog = config.integrationCatalog;
        this.registerRoutes();
    }

    get basePath(): string {
        const base = this.runner.basePath;
        return base === "/" ? "" : base;
    }

    private registerRoutes(): void {
        this.runner.get("/api/integrations", async () =>
            json(await this.integrationCatalog.list()));

        this.runner.get("/api/integrations/index", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            return index ? json(index) : notFound("integration not found");
        });

        this.runner.get("/api/integrations/versions", async (req) => {
            const kind = requiredSearchParam(req, "kind");
            const index = await this.integrationCatalog.getIndex(kind);
            if (!index) return notFound("integration not found");
            return json(index.versions);
        });

        this.runner.get("/api/integrations/definition", async (req) => {
            const url = new URL(req.url);
            const kind = requiredSearchParam(req, "kind");
            const definition = await this.integrationCatalog.get(kind, optionalText(url.searchParams.get("version")));
            return definition ? json(definition) : notFound("integration definition not found");
        });

        this.runner.get("/api/integrations/asset", async (req) => {
            const url = new URL(req.url);
            const kind = requiredSearchParam(req, "kind");
            const path = requiredSearchParam(req, "path");
            const version = optionalText(url.searchParams.get("version"));
            const asset = await this.integrationCatalog.getAsset?.(kind, version, path);
            if (!asset) return notFound("integration asset not found");
            return new Response(arrayBuffer(asset.bytes), {
                headers: {
                    "cache-control": "public, max-age=3600",
                    "content-type": asset.contentType,
                },
            });
        });
    }
}

function json(body: unknown, status = 200): Response {
    return Response.json(body, { status });
}

function notFound(message: string): Response {
    return json({ error: message }, 404);
}

function arrayBuffer(bytes: Uint8Array): ArrayBuffer {
    const buffer = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(buffer).set(bytes);
    return buffer;
}

function requiredSearchParam(req: Request, name: string): string {
    const value = optionalText(new URL(req.url).searchParams.get(name));
    if (!value) {
        throw Object.assign(new Error(`Missing param ${name}`), { status: 400 });
    }
    return value;
}

function optionalText(value: string | null): string | undefined {
    return value && value.trim() ? value.trim() : undefined;
}
