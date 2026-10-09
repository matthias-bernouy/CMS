import type { CollectionPageSurface } from "../../../interfaces/CollectionPage";
import { invalid } from "../../errors";
import { string } from "../../values";

export function parseSurface(value: unknown, path: string): CollectionPageSurface {
    if (value !== "control" && value !== "delivery") {
        return invalid("must be control or delivery", path);
    }
    return value;
}

export function parseDefaultPath(value: unknown, surface: CollectionPageSurface, path: string): string {
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
    const controlPath = route === "/admin" || route.startsWith("/admin/");
    if ((surface === "control") !== controlPath) {
        return invalid(
            surface === "control" ? "Control Pages must use /admin paths" : "Delivery Pages cannot use /admin paths",
            path,
        );
    }
    if (
        surface === "delivery" &&
        ["/.cms", "/api", "/assets", "/auth", "/login"].some(
            (prefix) => route === prefix || route.startsWith(`${prefix}/`),
        )
    ) {
        return invalid("Delivery Page path is reserved by the runtime", path);
    }
    return route;
}
