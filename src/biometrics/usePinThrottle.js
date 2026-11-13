import { useCallback, useEffect, useMemo, useState } from "react";
import { AppState } from "react-native";
import { CheckPasscodeResult } from "./utils";
import {
  authenticateDeviceOwner,
  formatPinAuthMessage,
  getPinAuthState,
  isPinSubmissionBlocked,
} from "../utilities/pinAuth";

const READY = { status: "invalid", failureCount: 0, retryAfterMs: 0 };

export function usePinThrottle(active = true) {
  const [pinAuthState, setPinAuthState] = useState(READY);

  const refresh = useCallback(async () => {
    if (!active) return READY;
    const next = await getPinAuthState();
    setPinAuthState(next);
    return next;
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    refresh();
    const subscription = AppState.addEventListener("change", (state) => {
      if (state === "active") refresh();
    });
    return () => subscription.remove();
  }, [active, refresh]);

  useEffect(() => {
    if (!active || pinAuthState.status !== "backoff") return undefined;
    const timer = setInterval(refresh, 1_000);
    return () => clearInterval(timer);
  }, [active, pinAuthState.status, refresh]);

  const verifyPin = useCallback(async (pin) => {
    const result = await CheckPasscodeResult(pin);
    setPinAuthState(result);
    return result;
  }, []);

  const verifyDevice = useCallback(async () => {
    const success = await authenticateDeviceOwner();
    await refresh();
    return success;
  }, [refresh]);

  return useMemo(() => ({
    pinAuthState,
    blocked: isPinSubmissionBlocked(pinAuthState),
    message: formatPinAuthMessage(pinAuthState),
    refresh,
    verifyPin,
    verifyDevice,
  }), [pinAuthState, refresh, verifyDevice, verifyPin]);
}
