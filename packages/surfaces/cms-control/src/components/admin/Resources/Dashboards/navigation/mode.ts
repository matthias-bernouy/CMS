export function isDashboardExampleMode(host: HTMLElement): boolean {
    return (
        host.hasAttribute("example") || window.location.pathname.replace(/\/+$/, "").endsWith("/admin/sources/example")
    );
}
