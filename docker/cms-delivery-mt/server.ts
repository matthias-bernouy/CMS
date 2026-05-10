// Multi-tenant Delivery cron bootstrap. Pure offline worker — no inbound
// HTTP, no nginx, no TLS. Runs `MtDeliveryCms.start()` once, then ticks
// every interval, building each enabled tenant.
//
// Mongo URL should point at a read-only user for everything except the
// (future) `tenant_<id>__delivery_state` collection.

import { MongoClient } from "mongodb";
import { MtDeliveryCms } from "@bernouy/cms-delivery-mt";
import { MongoTenantRepository } from "@bernouy/mt-cms-control";

const required = (k: string): string => {
    const v = process.env[k];
    if (!v) throw new Error(`Missing required env var: ${k}`);
    return v;
};

const MONGO_URL          = required("MONGO_URL");
const MONGO_DB_NAME      = process.env.MONGO_DB_NAME ?? "mt-cms";
const INTERVAL_MS        = Number(process.env.DELIVERY_INTERVAL_MS ?? 60_000);
const CONCURRENCY        = Number(process.env.DELIVERY_CONCURRENCY ?? 4);
const VARIANT_URL_PATTERN = process.env.DELIVERY_VARIANT_URL_PATTERN; // optional
const ENABLE_PLAYWRIGHT  = process.env.DELIVERY_DISABLE_PLAYWRIGHT !== "true";

const mongo = new MongoClient(MONGO_URL);
await mongo.connect();
const db = mongo.db(MONGO_DB_NAME);

const delivery = new MtDeliveryCms({
    db,
    tenantRepo: new MongoTenantRepository(db),
    intervalMs:  INTERVAL_MS,
    concurrency: CONCURRENCY,
    enableImageEnhancement: ENABLE_PLAYWRIGHT,
    ...(VARIANT_URL_PATTERN ? { variantUrlPattern: VARIANT_URL_PATTERN } : {}),
});

delivery.start();
console.log(`✅ cms-delivery-mt started (interval=${INTERVAL_MS}ms, concurrency=${CONCURRENCY}, playwright=${ENABLE_PLAYWRIGHT}, variants=${!!VARIANT_URL_PATTERN})`);

// Keep the process alive — Node/Bun would exit after the script body
// without an active handle. setInterval inside MtDeliveryCms covers that
// once the first tick is scheduled, but on first boot we have a race.
process.on("SIGINT",  async () => { await delivery.stop(); await mongo.close(); process.exit(0); });
process.on("SIGTERM", async () => { await delivery.stop(); await mongo.close(); process.exit(0); });
