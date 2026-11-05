import { NativeModules } from "react-native";

const FAIL_CLOSED_STATE = Object.freeze({
  status: "deviceCredentialRequired",
  failureCount: 10,
  retryAfterMs: 0,
});

const VALID_STATUSES = new Set([
  "success",
  "invalid",
  "backoff",
  "deviceCredentialRequired",
  "notConfigured",
]);

function normalize(result) {
  if (!result || !VALID_STATUSES.has(result.status)) return { ...FAIL_CLOSED_STATE };
  return {
    status: result.status,
    failureCount: Number.isFinite(result.failureCount) ? result.failureCount : 0,
    retryAfterMs: Number.isFinite(result.retryAfterMs) ? Math.max(0, result.retryAfterMs) : 0,
  };
}

export async function verifyAppPin(pin) {
  const api = NativeModules.StorageModule?.validateAppPin;
  if (typeof api !== "function") return { ...FAIL_CLOSED_STATE };
  try {
    return normalize(await api(pin));
  } catch {
    return { ...FAIL_CLOSED_STATE };
  }
}

export async function getPinAuthState() {
  const api = NativeModules.StorageModule?.getPinAuthState;
  if (typeof api !== "function") return { ...FAIL_CLOSED_STATE };
  try {
    return normalize(await api());
  } catch {
    return { ...FAIL_CLOSED_STATE };
  }
}

export async function authenticateDeviceOwner() {
  const api = NativeModules.StorageModule?.authenticateDeviceOwner;
  if (typeof api !== "function") return false;
  try {
    const result = await api();
    return result?.success === true;
  } catch {
    return false;
  }
}

export function formatPinAuthMessage(result) {
  if (result?.status === "backoff") {
    const seconds = Math.max(1, Math.ceil((result.retryAfterMs || 0) / 1000));
    return `Too many attempts. Try again in ${seconds} seconds.`;
  }
  if (result?.status === "deviceCredentialRequired") {
    return "Verify your device screen lock to continue.";
  }
  if (result?.status === "notConfigured") return "App PIN is not configured.";
  return "Wrong PIN.";
}

export function isPinSubmissionBlocked(result) {
  return result?.status === "backoff" || result?.status === "deviceCredentialRequired";
}
