import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PERPS_ENABLED, PERPS_BLOCKED_COUNTRIES } from "./config";

const RECHECK_MS = 2000;
const MAX_RECHECKS = 10;

const normalizeCountry = (countryCode) =>
  typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";

export const isPerpsBlockedCountry = (countryCode) =>
  PERPS_BLOCKED_COUNTRIES.includes(normalizeCountry(countryCode));

// Perps is shown only when the switch is on AND the country is known and not blocked.
// Fail closed: unknown country (no cached AppStatusChecks / no countryCode) => hidden.
// Uses the AppStatusChecks cached by CheckAppAvailable. While the country is unknown it
// re-reads the cache a few times, since the status request may finish after this screen mounts.
// `refreshKey` re-reads the cache, e.g. on focus.
export const usePerpsAvailability = (refreshKey) => {
  const [perpsVisible, setPerpsVisible] = useState(false);
  const [checked, setChecked] = useState(false);

  useEffect(() => {
    if (!PERPS_ENABLED) return;
    let mounted = true;
    let timer = null;
    let rechecks = 0;

    const check = async () => {
      let countryCode = "";
      try {
        const stored = await AsyncStorage.getItem("AppStatusChecks");
        countryCode = normalizeCountry(stored ? JSON.parse(stored)?.countryCode : "");
      } catch (e) {
        countryCode = "";
      }
      if (!mounted) return;
      const known = countryCode !== "";
      setPerpsVisible(known && !isPerpsBlockedCountry(countryCode));
      setChecked(true);
      if (!known && rechecks < MAX_RECHECKS) {
        rechecks += 1;
        timer = setTimeout(check, RECHECK_MS);
      }
    };

    check();
    return () => {
      mounted = false;
      if (timer) clearTimeout(timer);
    };
  }, [refreshKey]);

  // `checked` is true once the cache has been read at least once (lets screens avoid a flash).
  return { perpsVisible: PERPS_ENABLED && perpsVisible, checked: !PERPS_ENABLED || checked };
};
