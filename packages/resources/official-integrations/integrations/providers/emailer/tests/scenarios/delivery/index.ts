import { registerDeliveryConcurrencyTest } from "./concurrency";
import { registerDeliveryEscapingTest } from "./escaping";
import { registerDeliveryFailuresTest } from "./failures";
import { registerDeliveryLifecycleTest } from "./lifecycle";
import { registerTemplateProvisioningTest } from "./provisioning";
import { registerDeliveryValidationTest } from "./validation";

export function registerDeliveryTests(): void {
    registerDeliveryLifecycleTest();
    registerDeliveryConcurrencyTest();
    registerDeliveryValidationTest();
    registerDeliveryEscapingTest();
    registerDeliveryFailuresTest();
    registerTemplateProvisioningTest();
}
