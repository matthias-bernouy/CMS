import type DeliveryCms from "src/delivery/DeliveryCms";
import { compress, sendCompressed } from "src/socle/server/compression";

export default async function RobotsServer(req: Request, delivery: DeliveryCms) {
    const origin = new URL(req.url).origin;

    const body = [
        "User-agent: *",
        "Allow: /",
        `Disallow: ${delivery.cmsPathPrefix}/`,
        `Sitemap: ${origin}${delivery.basePath}/sitemap.xml`,
        "",
    ].join("\n");

    return sendCompressed(req, compress(body, "text/plain; charset=utf-8"));
}
