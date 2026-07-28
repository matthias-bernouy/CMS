export function discoverRepositoryNavigation(root: ShadowRoot, basePath: string): AbortController {
    const request = new AbortController();
    const item = root.querySelector<HTMLElement>("[data-repository-route]");
    if (!item) {
        return request;
    }
    item.hidden = true;
    void fetch(`${basePath}/api/repository/status`, {
        headers: { Accept: "application/json" },
        signal: request.signal,
    })
        .then((response) => {
            if (!request.signal.aborted) {
                item.hidden = response.status !== 200 && response.status !== 503;
            }
        })
        .catch(() => {
            item.hidden = true;
        });
    return request;
}
