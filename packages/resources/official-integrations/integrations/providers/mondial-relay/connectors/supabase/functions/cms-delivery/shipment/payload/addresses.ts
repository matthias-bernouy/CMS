import { isRecord } from "../../http.ts";
import type { Address, JsonRecord } from "../types.ts";
import { phoneValue, stringValue } from "./values.ts";

export function addressFrom(body: JsonRecord, prefix: "sender" | "recipient", defaults: Address): Address {
    const source = isRecord(body[prefix]) ? (body[prefix] as JsonRecord) : {};
    const key = (name: string) => `${prefix}${name.charAt(0).toUpperCase()}${name.slice(1)}`;
    const field = (...aliases: string[]) => {
        for (const alias of aliases) {
            if (Object.prototype.hasOwnProperty.call(source, alias)) {
                return { supplied: true, value: source[alias] };
            }
        }
        for (const alias of aliases) {
            const flatKey = key(alias);
            if (Object.prototype.hasOwnProperty.call(body, flatKey)) {
                return { supplied: true, value: body[flatKey] };
            }
        }
        return { supplied: false, value: undefined };
    };
    const text = (fallback: string, ...aliases: string[]) => {
        const input = field(...aliases);
        return { supplied: input.supplied, value: stringValue(input.supplied ? input.value : fallback) };
    };
    const nameInput = text(defaults.name, "name");
    const firstNameInput = text(defaults.firstName, "firstName", "firstname");
    const lastNameInput = text(defaults.lastName, "lastName", "lastname");
    const name = nameInput.value;
    const firstName = firstNameInput.value;
    const lastName = lastNameInput.value;
    const split = splitName(name);
    const country = text(defaults.country, "country").value.toUpperCase();
    const phone = field("phone", "phoneNo");
    const mobile = field("mobile", "mobileNo");
    return {
        name,
        firstName: firstNameInput.supplied ? firstName : firstName || split.firstName,
        lastName: lastNameInput.supplied ? lastName : lastName || split.lastName,
        addressLine1: text(defaults.addressLine1, "addressLine1", "address1").value,
        addressLine2: text(defaults.addressLine2, "addressLine2", "address2").value,
        addressLine3: text(defaults.addressLine3, "addressLine3", "address3").value,
        city: text(defaults.city, "city").value,
        postalCode: text(defaults.postalCode, "postalCode", "postal_code").value,
        country,
        phone: phoneValue(phone.supplied ? phone.value : defaults.phone, "", country, `${prefix}.phone`),
        mobile: phoneValue(mobile.supplied ? mobile.value : defaults.mobile, "", country, `${prefix}.mobile`),
        email: text(defaults.email, "email").value,
    };
}

function splitName(name: string): { firstName: string; lastName: string } {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length <= 1) {
        return { firstName: parts[0] || "Customer", lastName: parts[0] || "Customer" };
    }
    return { firstName: parts.slice(0, -1).join(" "), lastName: parts.at(-1) || "" };
}

export function splitStreet(addressLine: string): { houseNo: string; streetName: string } {
    const match = addressLine.trim().match(/^(\d+[A-Za-z]?)\s+(.+)$/);
    if (!match) {
        return { houseNo: "", streetName: addressLine.trim() };
    }
    return { houseNo: match[1] ?? "", streetName: match[2] ?? addressLine.trim() };
}
