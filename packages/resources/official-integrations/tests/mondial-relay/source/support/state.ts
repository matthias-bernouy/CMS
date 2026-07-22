import { defaultDeliveryQuoteRow, defaultSettingsRow } from "./fixtures/delivery.ts";
import type { JsonRecord, ObservedFetchRequest, ObservedFetchStep } from "./runtime.ts";

export type HarnessOptions = {
    connectNetworkError?: boolean;
    connectRedirect?: boolean;
    connectStatusCode?: string;
    connectStatusLevel?: string;
    connectStatusMessage?: string;
    connectResponses?: Array<{ code: string; level: string; message: string }>;
    trackingEventLabel?: string;
    trackingStatusCode?: string;
    cancellationRaceOnReconciliation?: "cancelled_unscanned" | "cancelled";
    trackingRedirect?: boolean;
    labelUrl?: string;
    labelContentType?: string;
    labelRedirect?: boolean;
    shipmentLeasePatchMiss?: boolean;
    shipmentLeasePatchFailure?: boolean;
};

export type HarnessState = {
    insertedShipments: JsonRecord[];
    shipmentEvents: JsonRecord[];
    labelAccessTokens: JsonRecord[];
    shipmentRecoveryEvents: JsonRecord[];
    relaySelections: JsonRecord[];
    deliveryQuotes: JsonRecord[];
    settingRow: JsonRecord;
    connectRequestXml: string;
    connectRequestCount: number;
    connectRequestRedirect: string;
    trackingRequestXml: string;
    trackingRequestCount: number;
    trackingRequestRedirect: string;
    cancellationRaceInjected: boolean;
    relayLookupUrl: URL | undefined;
    upstreamRequestUrls: string[];
    postgrestRequests: ObservedFetchRequest[];
    providerRequests: ObservedFetchRequest[];
    fetchTimeline: ObservedFetchStep[];
};

export function createHarnessState(): HarnessState {
    return {
        insertedShipments: [],
        shipmentEvents: [],
        labelAccessTokens: [],
        shipmentRecoveryEvents: [],
        relaySelections: [],
        deliveryQuotes: [defaultDeliveryQuoteRow()],
        settingRow: defaultSettingsRow(),
        connectRequestXml: "",
        connectRequestCount: 0,
        connectRequestRedirect: "",
        trackingRequestXml: "",
        trackingRequestCount: 0,
        trackingRequestRedirect: "",
        cancellationRaceInjected: false,
        relayLookupUrl: undefined,
        upstreamRequestUrls: [],
        postgrestRequests: [],
        providerRequests: [],
        fetchTimeline: [],
    };
}
