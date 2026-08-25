export type PagePathAvailabilityResult = "available" | "taken" | "unavailable" | "stale";

export class PagePathAvailability {
    private activeRequest: AbortController | null = null;

    constructor(
        private readonly document: Document,
        private readonly endpoint: () => string,
        private readonly currentPath: () => string,
    ) {}

    cancel(): void {
        this.activeRequest?.abort();
        this.activeRequest = null;
    }

    async check(path: string): Promise<PagePathAvailabilityResult> {
        const endpoint = this.endpoint();
        if (!endpoint) {
            return "unavailable";
        }
        this.cancel();
        const request = new AbortController();
        this.activeRequest = request;
        const url = new URL(endpoint, this.document.baseURI);
        url.searchParams.set("path", path);
        const currentPath = this.currentPath();
        if (currentPath) {
            url.searchParams.set("current-path", currentPath);
        }

        try {
            const response = await fetch(url, {
                signal: request.signal,
                headers: { Accept: "application/json" },
            });
            if (this.activeRequest !== request) {
                return "stale";
            }
            if (!response.ok) {
                return "unavailable";
            }
            const body = (await response.json()) as { exists?: unknown };
            return body.exists === true ? "taken" : "available";
        } catch (error) {
            return (error as { name?: unknown } | null)?.name === "AbortError" ? "stale" : "unavailable";
        } finally {
            if (this.activeRequest === request) {
                this.activeRequest = null;
            }
        }
    }
}
