import { join } from "node:path";

import type { Runner } from "../../../../../../interfaces/Runner";
import type { StorageProvider } from "../../exports/StorageProvider";
import { serveApi } from "../../../../../../serve/serveApiFolder";
import serveStaticFolder from "../../../../../../serve/serveStaticFolder/serveStaticFolder";

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

/**
 * Mounts everything that lives under `/admin`: API folder, vendor assets,
 * the runtime-built custom components bundle, and the static folder. Kept
 * out of `StorageProvider` so the constructor stays readable.
 */
export function mountAdminSurface(admin: Runner, provider: StorageProvider): void {
    const componentsBundlePromise = buildComponentsBundle();

    admin.group("/api", (api) => {
        serveApi(api, join(__dirname, "../../api/admin"), provider);
    });
    admin.get("/assets/ui.js",    () => new Response(Bun.file(wcUiPath)));
    admin.get("/assets/style.css", () => new Response(Bun.file(wcCssPath)));
    admin.get("/assets/components.js", async () => {
        const bundle = await componentsBundlePromise;
        if (!bundle) return new Response("// components build failed — see server logs", { status: 500 });
        return new Response(bundle, { headers: { "Content-Type": "application/javascript; charset=utf-8" } });
    });
    serveStaticFolder(admin, ADMIN_TEMPLATE, join(__dirname, "../../static/admin"));
}

async function buildComponentsBundle(): Promise<string | null> {
    const result = await Bun.build({
        entrypoints: [join(__dirname, "../../components/index.ts")],
        target:       "browser",
        minify:        true,
    });
    if (!result.success) {
        console.error("[StorageProvider] components build failed:");
        for (const log of result.logs) console.error(log);
        return null;
    }
    return await result.outputs[0]!.text();
}
