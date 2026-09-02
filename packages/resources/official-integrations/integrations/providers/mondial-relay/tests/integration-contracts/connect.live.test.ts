import { describe, expect, test } from "bun:test";

const liveConnectTest = process.env.MONDIAL_RELAY_CONNECT_LIVE_TEST === "1" ? test : test.skip;
const defaultConnectEndpoint = "https://connect-api-sandbox.mondialrelay.com/api/shipment";

describe("mondial-relay Connect API live probe", () => {
    liveConnectTest("creates a sandbox label through the Connect shipment endpoint", async () => {
        const xml = connectShipmentXml({
            login: requiredLiveEnv("MONDIAL_RELAY_CONNECT_LOGIN"),
            password: requiredLiveEnv("MONDIAL_RELAY_CONNECT_PASSWORD"),
            customerId: requiredLiveEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_ID"),
            location: liveEnv("MONDIAL_RELAY_CONNECT_RELAY_LOCATION", "FR-031270"),
            orderNo: `cms-v2-${Date.now()}`,
        });

        const response = await fetch(liveEnv("MONDIAL_RELAY_CONNECT_ENDPOINT", defaultConnectEndpoint), {
            method: "POST",
            headers: {
                accept: "application/xml",
                "content-type": "text/xml",
            },
            body: xml,
        });

        expect(response.status).toBe(200);
        const body = await response.text();
        const safeBody = sanitizeConnectResponse(body);
        const statusCodes = xmlStatusCodes(body);

        expect(statusCodes.includes("10061"), safeBody).toBe(false);
        expect(statusCodes.includes("10001"), safeBody).toBe(false);
        expect(statusCodes.includes("10000"), safeBody).toBe(false);
        expect(xmlAttr(body, "Shipment", "ShipmentNumber"), safeBody).toMatch(/^\d+$/);
        expect(xmlTag(body, "Output"), safeBody).toMatch(/^https?:\/\//);
        expect(body, safeBody).toContain('Key="ModeSandbox" Value="True"');
        expect(statusCodes, safeBody).toContain("0");
    });
});

type ConnectShipmentXmlOptions = {
    login: string;
    password: string;
    customerId: string;
    location: string;
    orderNo: string;
};

function connectShipmentXml(options: ConnectShipmentXmlOptions): string {
    return `<?xml version="1.0" encoding="utf-8"?>
<ShipmentCreationRequest xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance" xmlns:xsd="http://www.w3.org/2001/XMLSchema" xmlns="http://www.example.org/Request">
  <Context>
    <Login>${xmlEscape(options.login)}</Login>
    <Password>${xmlEscape(options.password)}</Password>
    <CustomerId>${xmlEscape(options.customerId)}</CustomerId>
    <Culture>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_CULTURE", "fr-FR"))}</Culture>
    <VersionAPI>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_VERSION_API", "1.0"))}</VersionAPI>
  </Context>
  <OutputOptions>
    <OutputFormat>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_OUTPUT_FORMAT", "10x15"))}</OutputFormat>
    <OutputType>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_OUTPUT_TYPE", "PdfUrl"))}</OutputType>
  </OutputOptions>
  <ShipmentsList>
    <Shipment>
      <OrderNo>${xmlEscape(options.orderNo)}</OrderNo>
      <CustomerNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_CUSTOMER_NO", "cms-test"))}</CustomerNo>
      <ParcelCount>1</ParcelCount>
      <ShipmentValue Currency="EUR" Amount="0.00" />
      <DeliveryMode Mode="24R" Location="${xmlEscape(options.location)}" />
      <CollectionMode Mode="CCC" Location="" />
      <Parcels>
        <Parcel>
          <Content>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_CONTENT", "Test products"))}</Content>
          <Length Value="30" Unit="cm" />
          <Width Value="20" Unit="cm" />
          <Depth Value="10" Unit="cm" />
          <Weight Value="${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_WEIGHT_GRAMS", "500"))}" Unit="gr" />
        </Parcel>
      </Parcels>
      <DeliveryInstruction></DeliveryInstruction>
      <Sender>
        <Address>
          <Title>Mr</Title>
          <Firstname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_FIRSTNAME", "Sender"))}</Firstname>
          <Lastname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_LASTNAME", "Test"))}</Lastname>
          <Streetname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_STREET", "Rue Test"))}</Streetname>
          <HouseNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_HOUSE_NO", "1"))}</HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_POSTAL_CODE", "75001"))}</PostCode>
          <City>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_CITY", "Paris"))}</City>
          <AddressAdd1>Mondial Relay</AddressAdd1>
          <AddressAdd2 />
          <AddressAdd3>Mondial Relay</AddressAdd3>
          <PhoneNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_PHONE", "0600000000"))}</PhoneNo>
          <MobileNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_MOBILE", "0600000000"))}</MobileNo>
          <Email>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_SENDER_EMAIL", "sender@example.test"))}</Email>
        </Address>
      </Sender>
      <Recipient>
        <Address>
          <Title>Mr</Title>
          <Firstname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_FIRSTNAME", "Client"))}</Firstname>
          <Lastname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_LASTNAME", "Test"))}</Lastname>
          <Streetname>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_STREET", "Rue Client"))}</Streetname>
          <HouseNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_HOUSE_NO", "10"))}</HouseNo>
          <CountryCode>FR</CountryCode>
          <PostCode>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_POSTAL_CODE", "76930"))}</PostCode>
          <City>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_CITY", "Octeville-sur-Mer"))}</City>
          <AddressAdd1 />
          <AddressAdd2 />
          <AddressAdd3 />
          <PhoneNo>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_PHONE", "0600000000"))}</PhoneNo>
          <MobileNo />
          <Email>${xmlEscape(liveEnv("MONDIAL_RELAY_CONNECT_RECIPIENT_EMAIL", "recipient@example.test"))}</Email>
        </Address>
      </Recipient>
    </Shipment>
  </ShipmentsList>
</ShipmentCreationRequest>`;
}

function xmlStatusCodes(body: string): string[] {
    return Array.from(body.matchAll(/<Status\b[^>]*\bCode="([^"]*)"/g)).map((match) => match[1] ?? "");
}

function xmlTag(body: string, tag: string): string {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`<${escaped}>(.*?)</${escaped}>`, "s"));
    return decodeXml(match?.[1] ?? "");
}

function xmlAttr(body: string, tag: string, attr: string): string {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = body.match(new RegExp(`<${escapedTag}\\b[^>]*\\b${escapedAttr}="([^"]*)"`, "s"));
    return decodeXml(match?.[1] ?? "");
}

function sanitizeConnectResponse(body: string): string {
    return body.replace(/<Password>.*?<\/Password>/s, "<Password>[redacted]</Password>");
}

function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

function liveEnv(name: string, fallback: string): string {
    const value = process.env[name]?.trim();
    return value || fallback;
}

function requiredLiveEnv(name: string): string {
    const value = process.env[name]?.trim();
    if (!value) {
        throw new Error(`${name} is required when MONDIAL_RELAY_CONNECT_LIVE_TEST=1`);
    }
    return value;
}
