import { useEffect, useMemo, useState } from "react";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { RWA_ENABLED } from "./config";
import { normalizeCountry, visibleAssets } from "./regions";
import { RWA_ASSETS } from "./data/assets";

// Same pattern as perps (own module state, not shared with perps): RWA is shown only when the
// switch is on AND the country is known AND at least one issuer allows it. Fail closed.
// Country comes from the AppStatusChecks cache written by CheckAppAvailable.
const RECHECK_MS = 2000;
const MAX_RECHECKS = 10;

let lastCountry = null; // last country read in this app session ("" = unknown)
const listeners = new Set();
const publish = (cc) => {
  const changed = lastCountry !== cc;
  lastCountry = cc;
  if (changed) listeners.forEach((fn) => fn(cc));
};

export const readCountry = async () => {
  try {
    const stored = await AsyncStorage.getItem("AppStatusChecks");
    return normalizeCountry(stored ? JSON.parse(stored)?.countryCode : "");
  } catch (e) {
    return "";
  }
};

export const useRwaAvailability = (refreshKey) => {
  const [country, setCountry] = useState(() => lastCountry || "");
  const [checked, setChecked] = useState(() => lastCountry !== null);

  useEffect(() => {
    const onChange = (cc) => {
      setCountry(cc);
      setChecked(true);
    };
    listeners.add(onChange);
    return () => listeners.delete(onChange);
  }, []);

  useEffect(() => {
    if (!RWA_ENABLED) return undefined;
    let mounted = true;
    let timer = null;
    let rechecks = 0;
    const check = async () => {
      const cc = await readCountry();
      publish(cc);
      if (!mounted) return;
      setCountry(cc);
      setChecked(true);
      if (!cc && rechecks < MAX_RECHECKS) {
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

  const assets = useMemo(() => (RWA_ENABLED ? visibleAssets(RWA_ASSETS, country) : []), [country]);
  return {
    rwaVisible: RWA_ENABLED && assets.length > 0,
    checked: !RWA_ENABLED || checked,
    country,
    assets,
  };
};
