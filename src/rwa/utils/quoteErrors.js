// Maps backend / 1inch quote errors ({ status, message } from proxyRequest) to user text.
// Never shows raw server text that could contain addresses or internals beyond a short reason.
const has = (msg, re) => re.test(String(msg || ""));

export const mapQuoteError = (err) => {
  if (!err) return null;
  const status = Number(err.status) || 0;
  const msg = Array.isArray(err.message) ? err.message.join(" ") : String(err.message || "");
  if (status === 451 || has(msg, /restricted|jurisdiction|not available in your (region|country)|geo/i)) {
    return { code: "region", text: "Not available in your region." };
  }
  if (status === 403 && has(msg, /invalid device/i)) {
    return { code: "device", text: "This device isn't recognised by the swap service. Try again later." };
  }
  if (status === 401 || status === 403) return { code: "auth", text: "Couldn't get a price right now. Close and reopen the app, then try again." };
  if (has(msg, /market (is )?closed|outside (of )?trading hours|halt/i)) {
    return { code: "closed", text: "The market for this asset is closed or paused. Try again when it opens." };
  }
  if (has(msg, /insufficient liquidity|no route|cannot (find|estimate)|not (supported|whitelisted|allowed)|unsupported token|token .*not found|invalid token|not tradable/i)) {
    return { code: "unsupported", text: "This token isn't available through our swap provider yet." };
  }
  if (has(msg, /amount.*(too (small|low))|min(imum)? (amount|order)/i)) return { code: "min", text: "Amount is too small for this asset." };
  if (status === 0) return { code: "network", text: "Network error — check your connection and try again." };
  if (status >= 500) return { code: "server", text: "The swap service is having trouble. Try again in a moment." };
  return { code: "other", text: "Couldn't get a quote. Try again." };
};
