import type { ReloadEmitter } from "../../dev-server/watch/types";

export function sseHandler(reload: ReloadEmitter): (request: Request) => Response {
    return (request) => {
        const encoder = new TextEncoder();
        const stream = new ReadableStream({
            start(controller) {
                const send = (chunk: string) => {
                    try {
                        controller.enqueue(encoder.encode(chunk));
                    } catch {}
                };
                send(": connected\n\n");
                const unsubscribe = reload.subscribe((tag) => send(`event: reload\ndata: ${tag}\n\n`));
                const ping = setInterval(() => send(": ping\n\n"), 25_000);
                const cleanup = () => {
                    clearInterval(ping);
                    unsubscribe();
                    try {
                        controller.close();
                    } catch {}
                };
                request.signal.addEventListener("abort", cleanup, { once: true });
            },
        });
        return new Response(stream, {
            headers: {
                "Content-Type": "text/event-stream",
                "Cache-Control": "no-store",
                Connection: "keep-alive",
            },
        });
    };
}
