import { NativeModules } from "react-native";

const unavailableError = () =>
  new Error("Transaction authentication settings are unavailable");

export const getTransactionAuthEnabled = async () => {
  const getter = NativeModules.StorageModule?.getTransactionAuthEnabled;
  if (typeof getter !== "function") return false;

  try {
    return (await getter()) !== false;
  } catch (_error) {
    return false;
  }
};

export const setTransactionAuthEnabled = async (enabled) => {
  const setter = NativeModules.StorageModule?.setTransactionAuthEnabled;
  if (typeof setter !== "function") throw unavailableError();

  const persistedState = await setter(Boolean(enabled));
  if (typeof persistedState !== "boolean") throw unavailableError();
  return persistedState;
};
