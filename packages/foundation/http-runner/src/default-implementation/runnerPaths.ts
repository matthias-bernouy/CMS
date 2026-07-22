export function urlJoin(...parts: string[]): string {
    return ("/" + parts.join("/")).replace(/\/+/g, "/") || "/";
}

export function normalizePath(path: string): string {
    return path.length > 1 && path.endsWith("/") ? path.slice(0, -1) : path;
}

export function pathUnderPrefix(pathname: string, prefix: string): boolean {
    if (prefix === "/") {
        return true;
    }
    return pathname === prefix || pathname.startsWith(prefix + "/");
}

export function matchPath(routePath: string, requestPath: string): boolean {
    const route = normalizePath(routePath);
    if (route === requestPath) {
        return true;
    }

    const routeParts = route.split("/");
    const requestParts = requestPath.split("/");
    if (routeParts.length !== requestParts.length) {
        return false;
    }
    return routeParts.every((part, index) => part.startsWith(":") || part === requestParts[index]);
}
