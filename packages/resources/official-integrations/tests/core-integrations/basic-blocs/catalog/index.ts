import { registerBuildTest } from "./build";
import { registerHydrationTest } from "./hydration";
import { registerNativeContentTest } from "./native-content";
import { registerNativeLinkTest } from "./native-link";
import { registerNativeListTest } from "./native-lists";

export function registerCatalogTests(): void {
    registerHydrationTest();
    registerBuildTest();
    registerNativeContentTest();
    registerNativeLinkTest();
    registerNativeListTest();
}
