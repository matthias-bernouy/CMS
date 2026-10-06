import { type FetchOutcome, runFetch } from "../fetcher";

type PendingRead = { controller: AbortController; consumers: number; result: Promise<FetchOutcome> };

/** A core shares concurrent automatic GETs only; completed reads are never cached. */
export class ReadRequests {
    private readonly pending = new Map<string, PendingRead>();

    constructor(private readonly document: Document) {}

    read = (url: string, signal: AbortSignal): Promise<FetchOutcome> => {
        if (signal.aborted) {
            return Promise.resolve({ kind: "aborted" });
        }
        const key = this.key(url);
        let request = this.pending.get(key);
        if (!request) {
            const controller = new AbortController();
            request = { controller, consumers: 0, result: runFetch(url, controller.signal) };
            this.pending.set(key, request);
            const current = request;
            void request.result.then(() => this.forget(key, current));
        }
        const current = request;
        current.consumers += 1;
        return new Promise((resolve) => {
            let finished = false;
            const finish = (outcome: FetchOutcome): void => {
                if (finished) {
                    return;
                }
                finished = true;
                signal.removeEventListener("abort", abort);
                current.consumers -= 1;
                if (current.consumers === 0 && this.pending.get(key) === current) {
                    this.forget(key, current);
                    current.controller.abort();
                }
                resolve(outcome.kind === "success" ? { ...outcome, data: structuredClone(outcome.data) } : outcome);
            };
            const abort = () => finish({ kind: "aborted" });
            signal.addEventListener("abort", abort, { once: true });
            void current.result.then(finish);
        });
    };

    private key(url: string): string {
        try {
            const canonical = new URL(url, this.document.baseURI);
            canonical.hash = "";
            canonical.searchParams.sort();
            return canonical.href;
        } catch {
            return url;
        }
    }

    private forget(key: string, request: PendingRead): void {
        if (this.pending.get(key) === request) {
            this.pending.delete(key);
        }
    }
}
