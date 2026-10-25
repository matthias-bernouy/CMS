import { expect } from "bun:test";
import { randomBytes, createHash } from "node:crypto";
import { chromium } from "playwright";

export async function connectBrowser(kernelUrl: string, administrator: { email: string; password: string }) {
    const resource = `${kernelUrl}/.cms/mcp`;
    const callback = `http://localhost:${new URL(kernelUrl).port}/mcp-test-callback`;
    const registration = await fetch(`${kernelUrl}/.cms/oauth/register`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ client_name: "Local MCP regression client", redirect_uris: [callback] }),
    });
    expect(registration.status).toBe(201);
    const client = (await registration.json()) as { client_id: string };
    const verifier = randomBytes(48).toString("base64url");
    const state = randomBytes(24).toString("base64url");
    const query = new URLSearchParams({
        response_type: "code",
        client_id: client.client_id,
        redirect_uri: callback,
        resource,
        code_challenge: createHash("sha256").update(verifier).digest("base64url"),
        code_challenge_method: "S256",
        scope: "cms:full",
        state,
    });
    const browser = await chromium.launch({ headless: true });
    const events: string[] = [];
    let currentPage: Awaited<ReturnType<typeof browser.newPage>> | undefined;
    try {
        const page = await browser.newPage();
        currentPage = page;
        page.on("response", (response) => {
            events.push(`${response.request().method()} ${new URL(response.url()).pathname} ${response.status()}`);
        });
        await page.route(`${callback}?**`, (route) =>
            route.fulfill({ status: 200, contentType: "text/html", body: "Authorization completed" }),
        );
        await page.goto(`${kernelUrl}/.cms/oauth/authorize?${query}`);
        const flowCookie = (await page.context().cookies()).find((cookie) => cookie.name === "cms-connect-flow");
        expect(flowCookie?.value).toBe(await page.locator('input[name="requestId"]').inputValue());
        page.on("request", (request) => {
            if (request.method() === "POST" && new URL(request.url()).pathname === "/.cms/oauth/authorize") {
                events.push(`Consent origin matches: ${request.headers().origin === kernelUrl}`);
            }
        });
        await page.getByLabel("Email", { exact: true }).fill(administrator.email);
        await page.getByLabel("Password", { exact: true }).fill(administrator.password);
        await Promise.all([
            page.waitForURL(`${callback}?**`),
            page.getByRole("button", { name: "Allow full access" }).click(),
        ]);
        const returned = new URL(page.url());
        expect(returned.searchParams.get("state")).toBe(state);
        const exchange = await fetch(`${kernelUrl}/.cms/oauth/token`, {
            method: "POST",
            headers: { "Content-Type": "application/x-www-form-urlencoded" },
            body: new URLSearchParams({
                grant_type: "authorization_code",
                client_id: client.client_id,
                redirect_uri: callback,
                resource,
                code: returned.searchParams.get("code")!,
                code_verifier: verifier,
            }),
        });
        expect(exchange.status).toBe(200);
        const token = (await exchange.json()) as { access_token: string; refresh_token: string };
        let nextId = 0;
        const rpc = async (method: string, params: unknown = {}) => {
            const response = await fetch(resource, {
                method: "POST",
                headers: {
                    Authorization: `Bearer ${token.access_token}`,
                    Accept: "application/json, text/event-stream",
                    "Content-Type": "application/json",
                    "MCP-Protocol-Version": "2025-11-25",
                },
                body: JSON.stringify({ jsonrpc: "2.0", id: ++nextId, method, params }),
                signal: AbortSignal.timeout(60_000),
            });
            expect(response.status).toBe(200);
            const message = (await response.json()) as { result?: any; error?: unknown };
            if (message.error) {
                throw new Error(`MCP ${method} failed: ${JSON.stringify(message.error)}`);
            }
            return message.result;
        };
        const catalogue = (await rpc("tools/list")) as { tools: { name: string; _meta: Record<string, string> }[] };
        const call = async (contract: string, capability: string, input: Record<string, unknown> = {}) => {
            const tool = catalogue.tools.find(
                (tool) =>
                    tool._meta["io.ulvia/contract"] === contract && tool._meta["io.ulvia/capability"] === capability,
            );
            if (!tool) {
                throw new Error(`Tool is missing: ${contract}/${capability}`);
            }
            const result = await rpc("tools/call", { name: tool.name, arguments: { input } });
            if (result.isError) {
                throw new Error(
                    `Capability failed: ${contract}/${capability} ${JSON.stringify(result.structuredContent)}`,
                );
            }
            return result.structuredContent.output;
        };
        return {
            page,
            browser,
            token,
            rpc,
            call,
            tools: catalogue.tools,
            async revoke() {
                await page.goto(`${kernelUrl}/.cms/connections`);
                await page.getByRole("button", { name: "Revoke access" }).click();
            },
        };
    } catch (error) {
        const detail = currentPage ? (await currentPage.locator("body").innerText()).slice(0, 1200) : "";
        await browser.close();
        throw new Error(`${String(error)}\nHTTP journey: ${events.slice(-20).join("; ")}\nPage: ${detail}`);
    }
}
