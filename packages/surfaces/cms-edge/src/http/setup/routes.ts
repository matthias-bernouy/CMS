import * as documentAsset from "./document.html" with { type: "text" };
import * as styleAsset from "./style.css" with { type: "text" };
import * as appAsset from "./app.asset.js" with { type: "text" };
import * as clientAsset from "./client.asset.js" with { type: "text" };
import * as reviewAsset from "./review.asset.js" with { type: "text" };
import * as progressAsset from "./progress.asset.js" with { type: "text" };
import type EdgeCms from "../../EdgeCms";
import { readGatewayRequestContext } from "@bernouy/cms-gateway/http/handlers";

function textAsset(module: object): string {
    const text = Reflect.get(module, "default");
    if (typeof text !== "string") {
        throw new TypeError("Setup assets require Bun's text loader");
    }
    return text;
}
const document = textAsset(documentAsset);
const style = textAsset(styleAsset);
const app = textAsset(appAsset);
const client = textAsset(clientAsset);
const review = textAsset(reviewAsset);
const progress = textAsset(progressAsset);

const headers = {
    "cache-control": "private, no-store",
    "x-content-type-options": "nosniff",
    "referrer-policy": "no-referrer",
    "x-frame-options": "DENY",
    "content-security-policy":
        "default-src 'none'; script-src 'self'; style-src 'self'; connect-src 'self'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'",
};

/** System presentation only. Authentication and mutations remain ordinary Gateway capabilities. */
export function mountSetupRoutes(edge: EdgeCms) {
    edge.runner.get(
        "/.cms/setup",
        () => new Response(document, { headers: { ...headers, "content-type": "text/html; charset=utf-8" } }),
    );
    for (const [path, body, contentType] of [
        ["style.css", style, "text/css"],
        ["app.asset.js", app, "text/javascript"],
        ["client.asset.js", client, "text/javascript"],
        ["review.asset.js", review, "text/javascript"],
        ["progress.asset.js", progress, "text/javascript"],
    ]) {
        edge.runner.get(
            `/.cms/setup/${path}`,
            () => new Response(body, { headers: { ...headers, "content-type": `${contentType}; charset=utf-8` } }),
        );
    }
}

/** One extra Gateway query on a missing home page only; ordinary content keeps its existing call count. */
export async function setupEntryResponse(edge: EdgeCms, request: Request, response: Response) {
    if (response.status !== 404 || new URL(request.url).pathname !== `${edge.basePath}/` || !edge.capabilityGateway) {
        return response;
    }
    try {
        const result = await edge.capabilityGateway.invoker.invoke({
            siteId: edge.capabilityGateway.siteId,
            contractId: "ulvia/cms.installations",
            capabilityId: "initialization.entry",
            input: {},
            actor: { kind: "anonymous" },
            signal: request.signal,
            requestContext: readGatewayRequestContext(request),
        });
        if (result.kind === "binary") {
            await result.stream.cancel();
        }
        if (
            result.kind === "success" &&
            result.output &&
            typeof result.output === "object" &&
            "pending" in result.output &&
            result.output.pending === true
        ) {
            await response.body?.cancel();
            return new Response(null, {
                status: 303,
                headers: { ...headers, location: `${edge.basePath}/.cms/setup` },
            });
        }
    } catch {
        /* Older selected installations contracts have no setup entry capability. */
    }
    return response;
}
