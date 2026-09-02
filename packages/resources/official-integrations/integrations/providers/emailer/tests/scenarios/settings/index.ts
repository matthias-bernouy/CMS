import { registerSettingsDefaultsTest } from "./defaults";
import { registerSettingsUpdatesTest } from "./updates";

export function registerSettingsTests(): void {
    registerSettingsDefaultsTest();
    registerSettingsUpdatesTest();
}
