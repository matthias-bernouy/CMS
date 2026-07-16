export type SourceOverlayFetchObservation = {
    url: string;
    method: string;
    headers: Headers;
};

type SourceOverlayFetchResponder = (request: Request) => Response | Promise<Response>;

export function createSourceOverlayFetchProbe(respond: SourceOverlayFetchResponder) {
    const observations: SourceOverlayFetchObservation[] = [];
    const fetchImpl = (async (input: RequestInfo | URL, init?: RequestInit) => {
        const request = new Request(input, init);
        observations.push({
            url: request.url,
            method: request.method,
            headers: new Headers(request.headers),
        });
        return await respond(request);
    }) as typeof fetch;

    return {
        fetchImpl,
        observations,
        count(pathname: string): number {
            return observations.filter(entry => new URL(entry.url).pathname === pathname).length;
        },
    };
}
