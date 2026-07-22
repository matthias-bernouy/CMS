import type { CmsFunction, ScheduledFunctionLogger, ScheduledFunctionTimer } from "@bernouy/cms-functions";

export const systemFunction = (id: string): CmsFunction => ({
    id,
    method: "POST",
    access: { mode: "system" },
    input: { body: { type: "object", properties: { runId: { type: "string" } }, required: ["runId"] } },
    output: [{ status: "200", body: { type: "object" } }],
    steps: [],
    return: { status: 200, body: {} },
});

export function scheduledLogger(): ScheduledFunctionLogger & { messages: string[] } {
    const messages: string[] = [];
    return {
        messages,
        info: (message) => messages.push(message),
        warn: (message) => messages.push(message),
        error: (message) => messages.push(message),
    };
}

export function fakeTimer(): ScheduledFunctionTimer & { callbacks: Array<() => void>; delays: number[] } {
    const callbacks: Array<() => void> = [];
    const delays: number[] = [];
    return {
        callbacks,
        delays,
        set(callback, delay) {
            callbacks.push(callback);
            delays.push(delay);
            return callback;
        },
        clear(handle) {
            const index = callbacks.indexOf(handle as () => void);
            if (index >= 0) {
                callbacks.splice(index, 1);
            }
        },
    };
}
