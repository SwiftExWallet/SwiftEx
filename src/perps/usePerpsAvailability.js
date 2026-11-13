import { useEffect, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { PERPS_ENABLED, PERPS_BLOCKED_COUNTRIES } from "./config";

const RECHECK_MS = 2000;
const MAX_RECHECKS = 10;

const normalizeCountry = (countryCode) =>
  typeof countryCode === "string" ? countryCode.trim().toUpperCase() : "";

export const isPerpsBlockedCountry = (countryCode) =>
  PERPS_BLOCKED_COUNTRIES.includes(normalizeCountry(countryCode));

// Result of the most recent read in this app session (null = never read). Lets screens answer
// synchronously on mount; every mount / refreshKey change still re-reads in the background and
// all mounted hooks follow the newest result (so a country that becomes blocked/unknown hides
// Perps everywhere).
let lastResult = null; // { visible: boolean }
const listeners = new Set();
const publish = (visible) => {
  const changed = !lastResult || lastResult.visible !== visible;
  lastResult = { visible };
  if (changed) listeners.forEach((fn) => fn(visible));
};

// Perps is shown only when the switch is on AND the country is known and not blocked.
// Fail closed: unknown country (no cached AppStatusChecks / no countryCode) => hidden.
// Uses the AppStatusChecks cached by CheckAppAvailable. While the country is unknown it
// re-reads the cache a few times, since the status request may finish after this screen mounts.
// Once the country is known there is no re-check loop. `refreshKey` re-reads, e.g. on focus.
export const usePerpsAvailability = (refreshKey) => {
  const [perpsVisible, setPerpsVisible] = useState(() => !!(lastResult && lastResult.visible));
  const [checked, setChecked] = useState(() => lastResult !== null);

  useEffect(() => {
    const onChange = (visible) => {
      setPerpsVisible(visible);
      setChecked(true);
    };
    listeners.add(onChange);
    return () => {
      listeners.delete(onChange);
    };
  }, []);

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
      const known = countryCode !== "";
      publish(known && !isPerpsBlockedCountry(countryCode));
      if (!mounted) return;
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
