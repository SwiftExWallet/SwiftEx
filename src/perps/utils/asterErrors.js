// Friendly messages for common Aster error codes. Falls back to Aster's own message.
const MESSAGES = {
  "-5050": "Deposit USDT to your Perps balance first.",
  "-2019": "Not enough margin for this order. Lower the amount or leverage.",
  "-4164": "Order is too small. Increase the amount (minimum order size not reached).",
  "-2022": "Close order rejected: there is no position left to reduce.",
  "-1111": "Amount or price has too many decimals for this market.",
  "-1013": "Amount or price is outside the allowed range for this market.",
  "-2021": "Trigger price would execute immediately. Adjust TP/SL.",
  "-2011": "Order not found. It may already be filled or cancelled.",
  "-4003": "Amount must be greater than zero.",
  "-4005": "Amount is above the maximum for this market.",
  "-4028": "Leverage is not valid for this market.",
  "-4046": "Margin type already set.",
  "-4047": "Can't change margin type while you have open orders.",
  "-4048": "Can't change margin type while you have an open position.",
  "-4061": "Position side does not match your account mode.",
  "-4131": "Price moved too much. Try again.",
  "-4225": "Request expired. Please try again.",
  "-1022": "Signature was rejected. Try again; if it repeats, reset the trading key.",
  "-2015": "Trading key not accepted. Enable trading again.",
  "-1002": "Trading key not accepted. Enable trading again.",
};

// "No need to change margin type." comes back as an error but is fine.
export const isMarginTypeAlreadySet = ({ code, error }) =>
  code === -4046 || /no need to change margin type/i.test(String(error || ""));

export const friendlyAsterError = ({ code, error }) => {
  if (code !== null && code !== undefined && MESSAGES[String(code)]) return MESSAGES[String(code)];
  return error || "Something went wrong";
};
