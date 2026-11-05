import { appendFile } from "node:fs/promises";
import { join } from "node:path";
import type { Connection } from "../scenarios/client";

export type EvaluationLane = "collection" | "revision" | "upload" | "clarification" | "observer";
export type EvaluationEvent = Record<string, unknown> & { lane: string; command: string };

export function evaluationBridge(
    connection: Connection,
    cmsUrl: string,
    root: string,
    pageId: string,
    options: { loseCompletionResponse?: boolean } = {},
) {
    const events: EvaluationEvent[] = [];
    const counts = new Map<string, number>();
    let interrupted = false;
    let completionResponseLost = false;
    const scopedUrl = (value: string) => {
        const url = new URL(value, cmsUrl);
        if (url.origin !== cmsUrl) {
            throw new Error("Only the isolated evaluation Edge is accessible");
        }
        return url;
    };
    return {
        events,
        async execute(lane: EvaluationLane, command: string, input: Record<string, any>) {
            if (!["collection", "revision", "upload", "clarification", "observer"].includes(lane)) {
                throw new Error("Unknown evaluation lane");
            }
            const count = (counts.get(lane) ?? 0) + 1;
            counts.set(lane, count);
            if (count > 60) {
                throw new Error("The 60-command evaluation budget is exhausted");
            }
            const event: EvaluationEvent = { lane, command, number: count };
            const started = performance.now();
            try {
                if (command === "catalogue") {
                    return connection.tools.map((tool) => ({
                        name: tool.name,
                        description: (tool as Record<string, unknown>).description,
                        contractId: tool._meta["io.ulvia/contract"],
                        capabilityId: tool._meta["io.ulvia/capability"],
                    }));
                }
                if (command === "describe") {
                    return connection.tools.find((tool) => tool.name === input.name) ?? null;
                }
                if (command === "rpc") {
                    if (!["tools/list", "tools/call", "resources/list", "resources/read"].includes(input.method)) {
                        throw new Error("Unsupported MCP method");
                    }
                    const tool = connection.tools.find((tool) => tool.name === input.params?.name);
                    event.method = input.method;
                    event.capability = tool?._meta["io.ulvia/capability"];
                    event.contract = tool?._meta["io.ulvia/contract"];
                    const args = input.params?.arguments?.input;
                    event.query = args?.query;
                    event.reference = args?.reference;
                    const result = await connection.rpc(input.method, input.params);
                    event.isError = result.isError === true;
                    event.errorCode = result.structuredContent?.error?.code;
                    if (event.isError && !event.errorCode) {
                        try {
                            event.errorCode = JSON.parse(
                                result.content?.find((item: { type: string }) => item.type === "text")?.text ?? "{}",
                            ).error?.code;
                        } catch {
                            event.errorCode = "unparseable_error";
                        }
                    }
                    event.valid = result.structuredContent?.output?.valid;
                    event.mode = result.structuredContent?.output?.mode;
                    if (
                        options.loseCompletionResponse &&
                        lane === "upload" &&
                        event.capability === "workspace.upload.complete" &&
                        !result.isError &&
                        !completionResponseLost
                    ) {
                        completionResponseLost = true;
                        event.responseSuppressed = true;
                        throw new Error("The tool response was lost after dispatch");
                    }
                    if (
                        lane === "revision" &&
                        !interrupted &&
                        event.capability === "pages.get" &&
                        args?.id === pageId
                    ) {
                        interrupted = true;
                        await connection.call("ulvia/cms.content", "pages.update", {
                            id: pageId,
                            expectedRevision: result.structuredContent.output.revision,
                            title: "Colleague revision",
                            content:
                                '<h1 cms-bloc="ulvia--mossa--heading" size="lg" text-align="start">Colleague reviewed heading</h1>',
                        });
                        event.concurrentEditInjected = true;
                    }
                    return result;
                }
                if (command === "http") {
                    if (!["GET", "PUT"].includes(input.method)) {
                        throw new Error("Only GET and PUT are available");
                    }
                    const url = scopedUrl(input.url);
                    const headers = new Headers(input.headers);
                    headers.set("Authorization", `Bearer ${connection.token.access_token}`);
                    const response = await fetch(url, {
                        method: input.method,
                        headers,
                        redirect: "error",
                        ...(input.method === "PUT" ? { body: input.body ?? "" } : {}),
                        signal: AbortSignal.timeout(30_000),
                    });
                    event.status = response.status;
                    return {
                        status: response.status,
                        headers: Object.fromEntries(response.headers),
                        body: await response.text(),
                    };
                }
                if (command === "browse") {
                    const url = scopedUrl(input.url);
                    const width = input.width ?? 1280;
                    if (!Number.isInteger(width) || width < 320 || width > 1920) {
                        throw new Error("Viewport width must be between 320 and 1920");
                    }
                    const page = await connection.browser.newPage({ viewport: { width, height: 900 } });
                    try {
                        await page.route("**/*", (route) =>
                            new URL(route.request().url()).origin === cmsUrl ? route.continue() : route.abort(),
                        );
                        const response = await page.goto(url.href);
                        const screenshot = join(root, `${lane}-${count}.png`);
                        await page.screenshot({ path: screenshot, fullPage: true });
                        event.status = response?.status();
                        event.width = width;
                        return {
                            status: response?.status(),
                            title: await page.title(),
                            screenshot,
                            headings: await page.locator("h1,h2,h3").allTextContents(),
                            text: (await page.locator("body").innerText()).slice(0, 12_000),
                            links: await page
                                .locator("a")
                                .evaluateAll((links) =>
                                    links.map((link) => ({ text: link.textContent, href: link.getAttribute("href") })),
                                ),
                            overflow: await page.evaluate(
                                () => document.documentElement.scrollWidth > window.innerWidth,
                            ),
                        };
                    } finally {
                        await page.close();
                    }
                }
                throw new Error("Unknown evaluation command");
            } catch (error) {
                event.failure = String(error);
                throw error;
            } finally {
                event.ms = Math.round(performance.now() - started);
                events.push(event);
                await appendFile(join(root, "events.jsonl"), `${JSON.stringify(event)}\n`, { mode: 0o600 });
            }
        },
    };
}
