import { registerBuildTest } from "./build";
import { registerHydrationTest } from "./hydration";
import { registerNativeContentTest } from "./native-content";

export function registerCatalogTests(): void {
    registerHydrationTest();
    registerBuildTest();
    registerNativeContentTest();
}
