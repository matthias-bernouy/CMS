import { requiredEnv } from "../../env.ts";
import { splitStreet } from "../../shipment/payload/index.ts";
import type { ShipmentPayload } from "../../shipment/types.ts";
import { xmlEscape } from "../xml.ts";

export function connectShipmentXml(payload: ShipmentPayload): string {
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
