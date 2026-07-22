import { registerBuildTest } from "./build";
import { registerHydrationTest } from "./hydration";

export function registerCatalogTests(): void {
    registerHydrationTest();
    registerBuildTest();
}
