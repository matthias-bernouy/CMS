import { InMemorySourceRepository } from "@bernouy/cms-sources";
import { accountsSource } from "./accounts";
import { commerceSource } from "./commerce";
import { deliverySource } from "./delivery";

export async function relaySources(): Promise<InMemorySourceRepository> {
    const sources = new InMemorySourceRepository();
    await sources.createSource(commerceSource());
    await sources.createSource(deliverySource());
    await sources.createSource(accountsSource());
    return sources;
}
