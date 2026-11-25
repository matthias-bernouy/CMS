import { createHttpErrorPages, selectErrorLanguage, staticErrorResponse } from "@bernouy/http-runner/html";
import type { Collection, Db } from "mongodb";
import { MAINTENANCE_HTML, MAINTENANCE_LIMITS } from "@bernouy/content/public-delivery";
import type { MaintenancePage } from "@bernouy/content/public-delivery";

type StoredPage = {
    _id: string;
    html: string;
    resources: { contentType: string; base64: string }[];
    expiresAt?: Date;
};
const DEFAULT_PAGES = { en: createHttpErrorPages(), fr: createHttpErrorPages("fr") };
const PREFIX = "/_content/maintenance/";
const HEADERS = { "cache-control": "no-store", "retry-after": "60", "x-robots-tag": "noindex, nofollow" };

/** Instance-local durable presentation, separate from release-switch intents and the Edge cache. */
export class MaintenancePages {
    private readonly pages: Collection<StoredPage>;
    private pending?: { key: string; promise: Promise<void> };
    private renderer: (prefix: string, signal: AbortSignal) => Promise<MaintenancePage> = async () => ({
        html: MAINTENANCE_HTML,
        resources: [],
    });
    constructor(
        db: Db,
        private readonly siteId: string,
    ) {
        this.pages = db.collection("site_maintenance_pages");
    }
    async init() {
        await this.pages.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    }
    configure(renderer: (prefix: string, signal: AbortSignal) => Promise<MaintenancePage>) {
        this.renderer = renderer;
    }
    prepare(siteId: string, id: string): Promise<void> {
        const key = this.key(siteId, id);
        if (this.pending) {
            if (this.pending.key !== key) {
                return Promise.reject(
                    Object.assign(new Error("Another maintenance Page is being prepared"), { status: 423 }),
                );
            }
            return this.pending.promise;
        }
        const promise = this.prepareOwned(key, id).finally(() => {
            this.pending = undefined;
        });
        this.pending = { key, promise };
        return promise;
    }
    private async prepareOwned(key: string, id: string) {
        if (await this.pages.findOne({ _id: key }, { projection: { _id: 1 } })) {
            return;
        }
        const page = await this.renderer(`${PREFIX}${id.slice(7)}`, AbortSignal.timeout(15_000));
        let bytes = Buffer.byteLength(page.html);
        if (page.resources.length > MAINTENANCE_LIMITS.resources) {
            throw new Error("Maintenance Page exceeds its resource limit");
        }
        for (const resource of page.resources) {
            bytes += resource.bytes.byteLength;
            if (
                resource.bytes.byteLength > MAINTENANCE_LIMITS.resourceBytes ||
                resource.contentType.length > 256 ||
                /[\r\n]/u.test(resource.contentType)
            ) {
                throw new Error("Invalid maintenance resource");
            }
        }
        if (bytes > MAINTENANCE_LIMITS.bytes) {
            throw new Error("Maintenance Page exceeds its byte limit");
        }
        try {
            await this.pages.insertOne({
                _id: key,
                html: page.html,
                resources: page.resources.map(({ contentType, bytes }) => ({
                    contentType,
                    base64: Buffer.from(bytes).toString("base64"),
                })),
            });
        } catch (error) {
            if ((error as { code?: number }).code !== 11000) {
                throw error;
            }
        }
    }
    async retire(siteId: string, id: string) {
        // Let assets finish loading for visitors who received the Page just before completion.
        await this.pages.updateOne(
            { _id: this.key(siteId, id) },
            { $set: { expiresAt: new Date(Date.now() + 86_400_000) } },
        );
    }
    async page(request: Request, id: string): Promise<Response | null> {
        const path = new URL(request.url).pathname;
        if (
            path.startsWith("/_content/") ||
            path.startsWith("/.cms/") ||
            ["/robots.txt", "/sitemap.xml", "/manifest.webmanifest"].includes(path)
        ) {
            return null;
        }
        const page = await this.pages.findOne({ _id: this.key(this.siteId, id) }, { projection: { html: 1 } });
        if (page && (typeof page.html !== "string" || Buffer.byteLength(page.html) > MAINTENANCE_LIMITS.bytes)) {
            throw new TypeError("Invalid persisted maintenance Page");
        }
        if (!page || page.html === MAINTENANCE_HTML) {
            const language = selectErrorLanguage(request.headers.get("accept-language"));
            return staticErrorResponse(request, 503, DEFAULT_PAGES[language], "60", language);
        }
        return new Response(request.method === "HEAD" ? null : (page?.html ?? MAINTENANCE_HTML), {
            status: 503,
            headers: { ...HEADERS, "content-type": "text/html; charset=utf-8" },
        });
    }
    async resource(request: Request): Promise<Response | null> {
        const path = new URL(request.url).pathname;
        if (!path.startsWith(PREFIX)) {
            return null;
        }
        const match = /^([0-9a-f]{64})\/(0|[1-9][0-9]?)$/u.exec(path.slice(PREFIX.length));
        if (!match || Number(match[2]) >= MAINTENANCE_LIMITS.resources) {
            return new Response(null, { status: 404, headers: HEADERS });
        }
        const page = await this.pages.findOne(
            { _id: this.key(this.siteId, `sha256:${match[1]}`) },
            { projection: { html: 0, expiresAt: 0, _id: 0, resources: { $slice: [Number(match[2]), 1] } } },
        );
        const resource = page?.resources[0];
        if (!resource) {
            return new Response(null, { status: 404, headers: HEADERS });
        }
        if (
            typeof resource.base64 !== "string" ||
            resource.base64.length > Math.ceil(MAINTENANCE_LIMITS.resourceBytes / 3) * 4 ||
            typeof resource.contentType !== "string" ||
            resource.contentType.length > 256 ||
            /[\r\n]/u.test(resource.contentType)
        ) {
            throw new TypeError("Invalid persisted maintenance resource");
        }
        return new Response(request.method === "HEAD" ? null : Buffer.from(resource.base64, "base64"), {
            headers: { ...HEADERS, "content-type": resource.contentType },
        });
    }
    private key(siteId: string, id: string) {
        if (siteId !== this.siteId || !/^sha256:[0-9a-f]{64}$/u.test(id)) {
            throw new TypeError("Invalid maintenance Page scope");
        }
        return JSON.stringify([siteId, id]);
    }
}
