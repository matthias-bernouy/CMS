import type { Runner } from "@bernouy/core";
import { scanStaticFolder } from "./scanStaticFolder";
import prepareHtml from "./prepareHtml";

export type ServeStaticFolderOptions = {
    /**
     * Inline `<script>` body injected before the bundled custom-element
     * script, used to set up `window._cms.CDN` synchronously so the first
     * `connectedCallback` of an admin page already sees a hydrated CDN.
     * Empty string (default) skips the inline script — useful for tests
     * or pages that don't need the CDN consumer.
     */
    hydrationScript?: string;
};

export default async function serveStaticFolder(runner: Runner, options: ServeStaticFolderOptions = {}) {

    const files = await scanStaticFolder();
    const hydrationScript = options.hydrationScript ?? "";

    for (const file of files) {

        if (file.relativePath.endsWith(".html")) {
            let routePath = file.relativePath.replace(/\.html$/, "");
            if (routePath === "index") {
                routePath = "/";
            } else if (routePath.endsWith("/index")) {
                routePath = routePath.slice(0, -5);
            }

            const finalRoute = routePath.startsWith("/") ? routePath : `/${routePath}`;

            runner.get(finalRoute, async () => {
                const htmlContent = await prepareHtml(file.absolutePath, runner, hydrationScript);

                return new Response(htmlContent, {
                    headers: {
                        "Content-Type": "text/html; charset=utf-8"
                    }
                });
            });

            continue;
        }


        // All cases
        runner.get(file.relativePath, () => {
            return new Response(Bun.file(file.absolutePath))
        })


    }

}
