export type JsonRecord = Record<string, unknown>;

export type Address = {
    name: string;
    firstName: string;
    lastName: string;
    addressLine1: string;
    addressLine2: string;
    addressLine3: string;
    city: string;
    postalCode: string;
    country: string;
    phone: string;
    mobile: string;
    email: string;
};

export type DeliverySettings = {
    id: string;
    modeCollection: string;
    modeDelivery: string;
    sender: Address;
    defaultWeightGrams: number;
    defaultPackageCount: number;
    defaultLengthCm: number;
    defaultWidthCm: number;
    defaultHeightCm: number;
    defaultContent: string;
    defaultShippingAmount: number;
    declaredCurrency: string;
    connectCulture: string;
    connectVersionApi: string;
    connectOutputFormat: string;
    connectOutputType: string;
    createdAt?: string;
    updatedAt?: string;
};

export type ShipmentPayload = {
    id: string;
    externalOrderId: string;
    customerId: string;
    modeCollection: string;
    modeDelivery: string;
    sender: Address;
    recipient: Address;
    deliveryRelayLocation: string;
    deliveryRelayCountry: string;
    weightGrams: number;
    packageCount: number;
    lengthCm: number;
    widthCm: number;
    heightCm: number;
    content: string;
    declaredValueMinorAmount: number;
    declaredValue: string;
    declaredCurrency: string;
    connectCulture: string;
    connectVersionApi: string;
    connectOutputFormat: string;
    connectOutputType: string;
    instructions: string;
    metadata: JsonRecord;
    raw: JsonRecord;
};

export type ConnectShipmentResult = {
    expeditionNumber: string;
    labelUrl: string;
    raw: JsonRecord;
    statuses: ConnectStatus[];
    relayPointInfo: JsonRecord;
};

export type ConnectStatus = {
    code: string;
    level: string;
    message: string;
};
