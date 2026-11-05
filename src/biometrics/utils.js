import AsyncStorage from "@react-native-async-storage/async-storage";
import { NativeModules } from "react-native";
import * as bcrypt from 'bcryptjs';
import { POSTFIX, SALTS } from "../Dashboard/constants";
import { verifyAppPin } from "../utilities/pinAuth";

let recoveryPin = null;

export async function createPinRecoveryBackup(pin) {
    try {
        if (!NativeModules.StorageModule?.createPinRecoveryBackup) return false;
        await NativeModules.StorageModule.createPinRecoveryBackup(pin);
        return true;
    } catch (error) {
        console.warn("PIN recovery backup not created yet:", error?.message);
        return false;
    }
}

export async function AddPassCode(passcode) {
    const getSalt = bcrypt.genSaltSync(SALTS);
    const encryptData = bcrypt.hashSync(passcode + POSTFIX, getSalt);
    await AsyncStorage.setItem("pin", JSON.stringify(encryptData));
    if (NativeModules.StorageModule?.setAppPin) {
        await NativeModules.StorageModule.setAppPin(passcode);
    }
    recoveryPin = passcode;
}

export async function CheckPasscode(passcode) {
    const result = await CheckPasscodeResult(passcode);
    return result.status === "success";
}

export async function CheckPasscodeResult(passcode) {
    const nativeResult = await verifyAppPin(passcode);
    if (nativeResult.status === "success") {
        recoveryPin = passcode;
        return nativeResult;
    }
    if (nativeResult.status !== "notConfigured") return nativeResult;

    const getPass = await AsyncStorage.getItem("pin");
    if (!getPass) return nativeResult;
    const valid = bcrypt.compareSync(passcode + POSTFIX, JSON.parse(getPass));
    if (valid) {
        recoveryPin = passcode;
        if (NativeModules.StorageModule?.setAppPin) {
            await NativeModules.StorageModule.setAppPin(passcode);
        }
        return { status: "success", failureCount: 0, retryAfterMs: 0 };
    }
    return { status: "invalid", failureCount: 0, retryAfterMs: 0 };
}

export function consumeRecoveryPin() {
    const pin = recoveryPin;
    recoveryPin = null;
    return pin;
}
