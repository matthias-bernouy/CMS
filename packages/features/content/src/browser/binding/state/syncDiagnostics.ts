export function reportSyncPublicationError(producer: "mutation" | "query", element: Element, error: unknown): void {
    console.error("cms-sync publication failed", {
        producer,
        target: element.getAttribute("cms-sync"),
        element,
        error,
    });
}
