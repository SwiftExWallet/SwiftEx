import { useEffect, useState } from "react";
import { AppState } from "react-native";

// true while the app is in the foreground. Perps screens combine it with screen focus so
// pollers / intervals / socket subscriptions stop while the app is in the background.
export const useAppActive = () => {
  const [active, setActive] = useState(AppState.currentState === "active");
  useEffect(() => {
    const sub = AppState.addEventListener("change", (s) => setActive(s === "active"));
    return () => sub.remove();
  }, []);
  return active;
};
