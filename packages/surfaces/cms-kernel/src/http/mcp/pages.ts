import { randomBytes } from "node:crypto";
import { encodeSessionEffect, SESSION_EFFECT_HEADER } from "@bernouy/cms-gateway/protocol";
import { applySessionEffect } from "../session/applySessionEffect";
import { accessCall, checkBrowserPost, form, McpHttpError, type CmsMcpHost } from "./protocol";

const FLOW_COOKIE = "cms-connect-flow";
const CSRF_COOKIE = "cms-connections-csrf";

export async function authorizationPage(request: Request, host: CmsMcpHost): Promise<Response> {
    if (request.method === "GET") {
        const prepared = await accessCall(
            host,
            "prepare-mcp-authorization",
            Object.fromEntries(new URL(request.url).searchParams),
        );
        const actor = await host.resolveActor(request);
        const login =
            actor.kind === "anonymous"
                ? '<label>Email <input type="email" name="email" required autocomplete="username"></label><label>Password <input type="password" name="password" required autocomplete="current-password"></label>'
                : "";
        return page(
            "Authorize application",
            `<h1>Authorize ${escape(prepared.clientName)}</h1><p>This application requests access to this CMS instance’s enabled MCP tools using your administrator account: Repository management, content, site files and collection installation.</p><p>Application callback: ${escape(prepared.redirectUri)}</p><form method="post"><input type="hidden" name="requestId" value="${escape(prepared.requestId)}">${login}<button name="decision" value="allow">Allow full access</button><button name="decision" value="deny" formnovalidate>Cancel</button></form>`,
            flowCookie(FLOW_COOKIE, prepared.requestId, host.publicUrl),
            new URL(prepared.redirectUri).origin,
        );
    }
    if (request.method !== "POST") {
        return new Response(null, { status: 405, headers: { Allow: "GET, POST" } });
    }
    const input = await form(request);
    checkBrowserPost(request, host.publicUrl, input.get("requestId"), FLOW_COOKIE);
    let actor = await host.resolveActor(request);
    let session: ReturnType<typeof encodeSessionEffect> | undefined;
    if (input.get("decision") === "deny") {
        const denied = await accessCall(host, "deny-mcp-authorization", { requestId: input.get("requestId") });
        return redirect(denied.redirectUri);
    }
    if (input.get("decision") !== "allow") {
        throw new McpHttpError("invalid_request", 400);
    }
    if (actor.kind === "anonymous") {
        const login = await host.invoker.invoke({
            siteId: "default",
            contractId: "ulvia.cms.access",
            capabilityId: "login-password",
            input: { email: input.get("email"), password: input.get("password") },
            actor,
        });
        if (login.kind !== "success" || !login.responseEffect || login.responseEffect.operation !== "establish") {
            throw new McpHttpError("invalid_credentials", 401);
        }
        const output = login.output as { subjectId: string; administrator: boolean };
        actor = { kind: output.administrator ? "administrator" : "user", subjectId: output.subjectId };
        session = encodeSessionEffect(login.responseEffect);
    }
    if (actor.kind !== "administrator") {
        throw new McpHttpError("access_denied", 403);
    }
    const result = await accessCall(host, "authorize-mcp-connection", { requestId: input.get("requestId") }, actor);
    const response = redirect(result.redirectUri);
    if (session) {
        response.headers.set(SESSION_EFFECT_HEADER, session);
    }
    return applySessionEffect(response, { secure: host.publicUrl.startsWith("https:") });
}

export async function connectionsPage(request: Request, host: CmsMcpHost): Promise<Response> {
    const actor = await host.resolveActor(request);
    if (actor.kind !== "administrator") {
        throw new McpHttpError("access_denied", 403);
    }
    if (request.method === "POST") {
        const input = await form(request);
        checkBrowserPost(request, host.publicUrl, input.get("csrf"), CSRF_COOKIE);
        await accessCall(host, "revoke-mcp-connection", { id: input.get("id") }, actor);
        return redirect(new URL("/.cms/connections", host.publicUrl).href);
    }
    if (request.method !== "GET") {
        return new Response(null, { status: 405 });
    }
    const cursor = new URL(request.url).searchParams.get("cursor") ?? undefined;
    const connections = (await accessCall(host, "list-mcp-connections", { cursor }, actor)) as {
        items: {
            id: string;
            clientName: string;
            createdAt: string;
            revoked: boolean;
        }[];
        nextCursor: string | null;
    };
    const csrf = randomBytes(32).toString("base64url");
    const rows = connections.items
        .map(
            (connection) =>
                `<li><strong>${escape(connection.clientName)}</strong> — ${escape(connection.createdAt)} — ${connection.revoked ? "Revoked" : `Full access<form method="post"><input type="hidden" name="csrf" value="${csrf}"><input type="hidden" name="id" value="${escape(connection.id)}"><button>Revoke access</button></form>`}</li>`,
        )
        .join("");
    return page(
        "Connected applications",
        `<h1>Connected applications</h1><ul>${rows || "<li>No connected applications</li>"}</ul>${connections.nextCursor ? `<a href="/.cms/connections?cursor=${encodeURIComponent(connections.nextCursor)}">Next applications</a>` : ""}`,
        flowCookie(CSRF_COOKIE, csrf, host.publicUrl),
    );
}

function flowCookie(name: string, value: string, publicUrl: string) {
    return `${name}=${value}; HttpOnly; SameSite=Lax; Path=/.cms; Max-Age=300${publicUrl.startsWith("https:") ? "; Secure" : ""}`;
}
function redirect(location: string) {
    return new Response(null, {
        status: 303,
        headers: { Location: location, "Cache-Control": "no-store", "Referrer-Policy": "no-referrer" },
    });
}
function escape(value: unknown) {
    return String(value).replace(
        /[&<>"']/gu,
        (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]!,
    );
}
function page(title: string, body: string, cookie: string, callbackOrigin?: string) {
    return new Response(
        `<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>body{font:16px system-ui;max-width:48rem;margin:4rem auto;padding:1rem}label{display:block;margin:1rem 0}input{display:block}button{margin:.5rem .5rem .5rem 0;padding:.6rem}li{margin:1rem 0}</style>${body}</html>`,
        {
            headers: {
                "Content-Type": "text/html; charset=utf-8",
                "Cache-Control": "no-store",
                "Set-Cookie": cookie,
                "Referrer-Policy": "same-origin",
                "Content-Security-Policy": `default-src 'none'; style-src 'unsafe-inline'; form-action 'self'${callbackOrigin ? ` ${callbackOrigin}` : ""}; frame-ancestors 'none'; base-uri 'none'`,
                "X-Content-Type-Options": "nosniff",
            },
        },
    );
}
