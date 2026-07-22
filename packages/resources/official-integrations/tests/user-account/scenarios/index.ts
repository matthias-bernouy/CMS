import { registerAuthorizationTest } from "./authorization";
import { registerAvatarTest } from "./avatar";
import { registerLifecycleTest } from "./lifecycle";
import { registerMetadataTest } from "./metadata";

export function registerUserAccountSourceTests(): void {
    registerLifecycleTest();
    registerMetadataTest();
    registerAvatarTest();
    registerAuthorizationTest();
}
