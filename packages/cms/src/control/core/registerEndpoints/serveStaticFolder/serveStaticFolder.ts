import type { Runner } from "@bernouy/socle";
import { scanStaticFolder } from "./scanStaticFolder";
import prepareHtml from "./prepareHtml";

export default async function serveStaticFolder(runner: Runner) {

    const files = await scanStaticFolder();

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
                const htmlContent = await prepareHtml(file.absolutePath, runner);

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
