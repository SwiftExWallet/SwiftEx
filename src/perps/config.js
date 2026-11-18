// Feature switch for Perps. When PERPS_ENABLED is false the app must look and behave exactly as before.
// Dev builds only until the pending native work is done (secure agent-key storage, withdraw signing).
export const PERPS_ENABLED = __DEV__;

// ISO country codes (from AppStatusChecks.countryCode) where Perps is hidden.
export const PERPS_BLOCKED_COUNTRIES = ['US', 'GB', 'HK'];

// SwiftEx builder (per-trade) fee: OFF. Do not send approveBuilder or builder/feeRate on orders.
//
// TODO (future, only if the product decides to charge a fee) — Aster research notes (2026-11-13):
// - User approval, signed once by the MAIN wallet: POST /fapi/v3/approveBuilder
//   params: user, nonce, signature (EIP-712 primaryType=ApproveBuilder), builder, maxFeeRate (string),
//   builderName (optional). Domain {name:'AsterSignTransaction', version:'1', chainId:56,
//   verifyingContract:0x0…0} + signatureChainId=56, like the demo's other main-wallet calls.
//   Can also be set together with the agent approval (builder / builderName / maxFeeRate params).
// - Max fee: maxFeeRate <= 0.001 (0.1%). 0.03% would be "0.0003".
// - Orders (agent-signed): POST /fapi/v3/order with builder=<address> & feeRate <= maxFeeRate.
// - Manage: POST /fapi/v3/updateBuilder, DELETE /fapi/v3/builder, GET /fapi/v3/builder;
//   builder-side: GET /fapi/v3/builder/approvedUserList, /builder/userCommissions, /builder/userTrades.
// - Requirements: builder address registered on Aster and holding >= 100 ASTER in its futures account.
// - Errors: -2031 INVALID_BUILDER_PARAMETER, -5053 USER_NOT_BOUND_TO_BUILDER.
// Sources: asterdex.github.io/aster-api-website/asterCode/endpoints, .../integration-flow,
//          github.com/asterdex/api-docs demo/aster-code.py
export const PERPS_BUILDER_FEE = null;
