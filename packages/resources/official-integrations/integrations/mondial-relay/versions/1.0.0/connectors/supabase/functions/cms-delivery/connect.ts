import { envDefault, requiredEnv } from "./env.ts";
import { ProviderStatusError } from "./http.ts";
import { splitStreet } from "./payload.ts";
import type { ConnectShipmentResult, ConnectStatus, JsonRecord, ShipmentPayload } from "./types.ts";
import { decodeXml, xmlAttr, xmlAttributes, xmlEscape, xmlTag } from "./xml.ts";

const defaultConnectEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";

export async function createConnectShipment(payload: ShipmentPayload): Promise<ConnectShipmentResult> {
    const requestXml = connectShipmentXml(payload);
    const response = await fetch(connectEndpoint(), {
        method: "POST",
        headers: {
            accept: "application/xml",
            "content-type": "text/xml",
        },
        body: requestXml,
    }).catch(() => {
        throw new ProviderStatusError(502, "Mondial Relay Connect request failed", providerContext(payload, []));
    });
    const text = await response.text();
    if (!response.ok) {
        throw new ProviderStatusError(502, `Mondial Relay Connect returned HTTP ${response.status}`, providerContext(payload, []));
    }

    const statuses = connectStatuses(text);
    const blocking = statuses.find(status => /error|critical/i.test(status.level));
    if (blocking) {
        throw new ProviderStatusError(
            502,
            `Mondial Relay Connect returned status ${blocking.code}: ${blocking.message || connectStatusMessage(blocking.code)}`,
            providerContext(payload, statuses),
        );
    }

    const expeditionNumber = xmlAttr(text, "Shipment", "ShipmentNumber");
    const labelUrl = xmlTag(text, "Output");
    if (!expeditionNumber) {
        throw new ProviderStatusError(502, "Mondial Relay Connect did not return a shipment number", providerContext(payload, statuses));
    }

    return {
        expeditionNumber,
        labelUrl,
        raw: {
            statuses,
            modeSandbox: text.includes('Key="ModeSandbox" Value="True"'),
            relayPointInfo: relayPointInfo(text),
        },
        statuses,
        relayPointInfo: relayPointInfo(text),
    };
}

function connectShipmentXml(payload: ShipmentPayload): string {
    const senderStreet = splitStreet(payload.sender.addressLine1);
    const recipientStreet = splitStreet(payload.recipient.addressLine1);
    return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.example.org/Request">
  <Context>
    <Login>${xmlEscape(requiredEnv("MONDIAL_RELAY_CONNECT_LOGIN"))}</Login>
    <Password>${xmlEscape(requiredEnv("MONDIAL_RELAY_CONNECT_PASSWORD"))}</Password>
    <CustomerId>${xmlEscape(requiredEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"))}</CustomerId>
    <Culture>${xmlEscape(payload.connectCulture)}</Culture>
    <VersionAPI>${xmlEscape(payload.connectVersionApi)}</VersionAPI>
  </Context>
  <OutputOptions>
    <OutputFormat>${xmlEscape(payload.connectOutputFormat)}</OutputFormat>
    <OutputType>${xmlEscape(payload.connectOutputType)}</OutputType>
  </OutputOptions>
  <ShipmentsList>
    <Shipment>
      <OrderNo>${xmlEscape(payload.externalOrderId || payload.id)}</OrderNo>
      <CustomerNo>${xmlEscape(payload.customerId || "cms")}</CustomerNo>
      <ParcelCount>${payload.packageCount}</ParcelCount>
      <ShipmentValue Currency="${xmlEscape(payload.declaredCurrency)}" Amount="${xmlEscape(payload.declaredValue)}" />
      <DeliveryMode Mode="${xmlEscape(payload.modeDelivery)}" Location="${xmlEscape(payload.deliveryRelayLocation)}" />
      <CollectionMode Mode="${xmlEscape(payload.modeCollection)}" Location="" />
      <Parcels>
        <Parcel>
          <Content>${xmlEscape(payload.content)}</Content>
          <Length Value="${payload.lengthCm}" Unit="cm" />
          <Width Value="${payload.widthCm}" Unit="cm" />
          <Depth Value="${payload.heightCm}" Unit="cm" />
          <Weight Value="${payload.weightGrams}" Unit="gr" />
        </Parcel>
      </Parcels>
      <DeliveryInstruction>${xmlEscape(payload.instructions)}</DeliveryInstruction>
      <Sender>
        <Address>
          <Title>Mr</Title>
          <Firstname>${xmlEscape(payload.sender.firstName)}</Firstname>
          <Lastname>${xmlEscape(payload.sender.lastName)}</Lastname>
          <Streetname>${xmlEscape(senderStreet.streetName)}</Streetname>
          <HouseNo>${xmlEscape(senderStreet.houseNo)}</HouseNo>
          <CountryCode>${xmlEscape(payload.sender.country)}</CountryCode>
          <PostCode>${xmlEscape(payload.sender.postalCode)}</PostCode>
          <City>${xmlEscape(payload.sender.city)}</City>
          <AddressAdd1>${xmlEscape(payload.sender.addressLine2)}</AddressAdd1>
          <AddressAdd2 />
          <AddressAdd3>${xmlEscape(payload.sender.addressLine3)}</AddressAdd3>
          <PhoneNo>${xmlEscape(payload.sender.phone)}</PhoneNo>
          <MobileNo>${xmlEscape(payload.sender.mobile)}</MobileNo>
          <Email>${xmlEscape(payload.sender.email)}</Email>
        </Address>
      </Sender>
      <Recipient>
        <Address>
          <Title>Mr</Title>
          <Firstname>${xmlEscape(payload.recipient.firstName)}</Firstname>
          <Lastname>${xmlEscape(payload.recipient.lastName)}</Lastname>
          <Streetname>${xmlEscape(recipientStreet.streetName)}</Streetname>
          <HouseNo>${xmlEscape(recipientStreet.houseNo)}</HouseNo>
          <CountryCode>${xmlEscape(payload.recipient.country)}</CountryCode>
          <PostCode>${xmlEscape(payload.recipient.postalCode)}</PostCode>
          <City>${xmlEscape(payload.recipient.city)}</City>
          <AddressAdd1>${xmlEscape(payload.recipient.addressLine2)}</AddressAdd1>
          <AddressAdd2 />
          <AddressAdd3>${xmlEscape(payload.recipient.addressLine3)}</AddressAdd3>
          <PhoneNo>${xmlEscape(payload.recipient.phone)}</PhoneNo>
          <MobileNo>${xmlEscape(payload.recipient.mobile)}</MobileNo>
          <Email>${xmlEscape(payload.recipient.email)}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;
}

function connectStatuses(source: string): ConnectStatus[] {
    const xmlStatuses = xmlAttributes(source, "Status").map(attrs => ({
        code: attrs.Code ?? "",
        level: attrs.Level ?? "",
        message: attrs.Message ?? "",
    })).filter(status => status.code || status.message);
    if (xmlStatuses.length) return xmlStatuses;
    let value: { statusListField?: Array<{ codeField?: string; levelField?: string; messageField?: string }> };
    try {
        value = JSON.parse(source) as { statusListField?: Array<{ codeField?: string; levelField?: string; messageField?: string }> };
    } catch {
        return [];
    }
    return (value.statusListField ?? []).map(status => ({
        code: status.codeField ?? "",
        level: status.levelField ?? "",
        message: status.messageField ?? "",
    }));
}

function relayPointInfo(source: string): JsonRecord {
    const values: JsonRecord = {};
    for (const attrs of xmlAttributes(source, "LabelValues")) {
        const key = attrs.Key;
        if (!key) continue;
        values[key] = decodeXml(attrs.Value ?? "");
    }
    return values;
}

function providerContext(payload: ShipmentPayload, statuses: ConnectStatus[]): JsonRecord {
    return {
        operation: "ShipmentCreationRequest",
        endpoint: connectEndpoint(),
        statuses,
        fields: {
            customerId: requiredEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            modeCollection: payload.modeCollection,
            modeDelivery: payload.modeDelivery,
            deliveryRelayLocation: payload.deliveryRelayLocation,
            weightGrams: payload.weightGrams,
        },
    };
}

function connectEndpoint(): string {
    return envDefault("MONDIAL_RELAY_CONNECT_ENDPOINT", defaultConnectEndpoint);
}

function connectStatusMessage(code: string): string {
    return CONNECT_STATUS_MESSAGES[code] ?? "unmapped Mondial Relay Connect error";
}

const CONNECT_STATUS_MESSAGES: Record<string, string> = {
    "0": "success",
    "10000": "missing login or password",
    "10001": "invalid login or password",
    "10002": "missing customer id",
    "10003": "missing culture",
    "10004": "missing API version",
    "10007": "invalid API version",
    "10009": "missing output type",
    "10011": "empty shipment list",
    "10012": "missing sender information",
    "10014": "unknown reference ignored",
    "10061": "invalid XML format",
};
