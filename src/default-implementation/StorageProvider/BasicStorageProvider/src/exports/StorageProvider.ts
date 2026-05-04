import { join } from "node:path";

import type { Runner } from "../../../../../interfaces/Runner";
import type { Authentication } from "../../../../../interfaces/Authentication";
import { serveApi } from "../../../../../serve/serveApiFolder";
import serveStaticFolder from "../../../../../serve/serveStaticFolder/serveStaticFolder";
import type { BucketRepository } from "../interfaces/repositories/BucketRepository";
import type { BucketCredentialRepository } from "../interfaces/repositories/BucketCredentialRepository";
import type { StoredFolderRepository } from "../interfaces/repositories/StoredFolderRepository";
import type { StoredFileRepository } from "../interfaces/repositories/StoredFileRepository";
import type { BlobStorage } from "../interfaces/BlobStorage";
import { createAdminGuard } from "../core/authentication/createAdminGuard";

// `with { type: "file" }` resolves at runtime to the absolute file path; the
// cast is needed because TS still types the bare package import as the module.
import _wcUiModule from "@bernouy/webcomponents"            with { type: "file" };
import wcCssPath  from "@bernouy/webcomponents/style.css" with { type: "file" };
const wcUiPath = _wcUiModule as unknown as string;

const ADMIN_TEMPLATE = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>BasicStorageProvider Admin</title>
<link rel="stylesheet" href="{{BASE_PATH}}/assets/style.css">
<script src="{{BASE_PATH}}/assets/ui.js" defer></script>
<script src="{{BASE_PATH}}/assets/components.js" defer></script>
</head>
<body>
{{CONTENT}}
</body>
</html>`;

export type StorageProviderConfig = {
    /** When set, bucket changes regenerate the cache-control map fragment and reload Nginx.
     *  Leave undefined for tests / dev where Nginx isn't running. */
    nginx?: {
        cacheControlsPath: string;
        binary?: string;
    };
    /** Origin (`https://host`, no trailing slash) used when building public file
     *  URLs. Receives the bucket id; defaults to
     *  `https://${bucketId}.cdn.bernouy.com`. */
    publicHost?: (bucketId: string) => string;
};

export type StorageProviderDeps = {
    runner: Runner;
    authentication: Authentication;
    bucketRepo: BucketRepository;
    bucketCredentialRepo: BucketCredentialRepository;
    storedFolderRepo: StoredFolderRepository;
    storedFileRepo: StoredFileRepository;
    blobStorage: BlobStorage;
    config?: StorageProviderConfig;
};

export class StorageProvider {

    private _runner:               Runner;
    private _auth:                 Authentication;
    private _bucketRepo:           BucketRepository;
    private _bucketCredentialRepo: BucketCredentialRepository;
    private _storedFolderRepo:     StoredFolderRepository;
    private _storedFileRepo:       StoredFileRepository;
    private _blobStorage:          BlobStorage;
    private _config:               StorageProviderConfig;

    constructor(deps: StorageProviderDeps) {
        this._runner               = deps.runner;
        this._auth                 = deps.authentication;
        this._bucketRepo           = deps.bucketRepo;
        this._bucketCredentialRepo = deps.bucketCredentialRepo;
        this._storedFolderRepo     = deps.storedFolderRepo;
        this._storedFileRepo       = deps.storedFileRepo;
        this._blobStorage          = deps.blobStorage;
        this._config               = deps.config ?? {};

        const guard = createAdminGuard(this._auth);

        // Custom components bundle is built once at startup, served from memory.
        // First request awaits the build; subsequent ones reuse the resolved string.
        const componentsBundlePromise = (async () => {
            const result = await Bun.build({
                entrypoints: [join(__dirname, "../components/index.ts")],
                target:       "browser",
                minify:        true,
            });
            if (!result.success) {
                console.error("[StorageProvider] components build failed:");
                for (const log of result.logs) console.error(log);
                return null;
            }
            return await result.outputs[0]!.text();
        })();

        // Single /admin parent so `{{BASE_PATH}}` in static pages resolves to
        // `/admin` and `{{BASE_PATH}}/api/...` lands on the admin API.
        this._runner.group("/admin", (admin) => {
            admin.group("/api", (api) => {
                serveApi(api, join(__dirname, "../api/admin"), this);
            });
            admin.get("/assets/ui.js",    () => new Response(Bun.file(wcUiPath)));
            admin.get("/assets/style.css", () => new Response(Bun.file(wcCssPath)));
            admin.get("/assets/components.js", async () => {
                const bundle = await componentsBundlePromise;
                if (!bundle) return new Response("// components build failed — see server logs", { status: 500 });
                return new Response(bundle, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
            });
            serveStaticFolder(admin, ADMIN_TEMPLATE, join(__dirname, "../static/admin"));
        }, [guard]);
    }

    get runner()               { return this._runner; }
    get auth()                 { return this._auth; }
    get bucketRepo()           { return this._bucketRepo; }
    get bucketCredentialRepo() { return this._bucketCredentialRepo; }
    get storedFolderRepo()     { return this._storedFolderRepo; }
    get storedFileRepo()       { return this._storedFileRepo; }
    get blobStorage()          { return this._blobStorage; }
    get config()               { return this._config; }
}
