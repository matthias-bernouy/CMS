import { invalid } from "../../errors";
import { string } from "../../values";

export function parseDefaultPath(value: unknown, path: string): string {
    const route = string(value, 512, path);
    if (
        !route.startsWith("/") ||
        route.includes("?") ||
        route.includes("#") ||
        route.includes("\\") ||
        route.includes("//") ||
        route.split("/").some((segment) => segment === "." || segment === "..")
    ) {
        return invalid("must be a normalized absolute path without query or fragment", path);
    }
    if (
        ["/.cms", "/api", "/assets", "/auth", "/login"].some(
            (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        )
    ) {
        return invalid("Page path is reserved by the kernel", path);
    }
    return route;
}
