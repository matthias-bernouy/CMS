import { registerDeliveryEscapingTest } from "./escaping";
import { registerDeliveryFailuresTest } from "./failures";
import { registerDeliveryLifecycleTest } from "./lifecycle";
import { registerDeliveryValidationTest } from "./validation";

export function registerDeliveryTests(): void {
    registerDeliveryLifecycleTest();
    registerDeliveryValidationTest();
    registerDeliveryEscapingTest();
    registerDeliveryFailuresTest();
}
