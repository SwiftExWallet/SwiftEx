const RECOVERY_ERROR_MESSAGES = {
  1: 'Recovery is already initialized for this wallet.',
  2: 'This wallet is not registered for recovery.',
  3: 'Recovery is already registered for this wallet.',
  4: 'A recovery request is already in progress.',
  5: 'There is no pending recovery to complete.',
  6: 'The recovery safety waiting period has not ended yet.',
  7: 'The recovery proof could not be verified.',
  8: 'This email provider’s DKIM key is not approved for recovery.',
  9: 'The recovery email does not match the email registered for this wallet.',
  10: 'The recovery verification data does not match this wallet.',
  11: 'This recovery request has already been used.',
  12: 'The recovery proof contains invalid verification data.',
  13: 'The recovery destination cannot receive this asset. Add the required trustline, then try again.',
  14: 'There are no eligible assets available to recover.',
  15: 'Recovery could not be completed because the request is invalid.',
  16: 'Too many assets were selected for recovery.',
};

const NAMED_RECOVERY_ERRORS = {
  AlreadyInitialized: 1,
  NotRegistered: 2,
  AlreadyRegistered: 3,
  RecoveryInProgress: 4,
  NoRecoveryPending: 5,
  StillLocked: 6,
  BadProof: 7,
  UnknownDkimKey: 8,
  WrongCommitment: 9,
  WrongSalt: 10,
  NullifierUsed: 11,
  BadPublicInputs: 12,
  BadDestination: 13,
  NothingToRecover: 14,
  InvalidParams: 15,
  TooManyAssets: 16,
};

export const FALLBACK_RECOVERY_ERROR =
  'Recovery could not be completed. Please try again or contact support.';

function recoveryErrorCode(message) {
  const numbered = String(message).match(/(?:Contract,\s*#|Error\(Contract,\s*#)(\d+)/i);
  if (numbered) return Number(numbered[1]);

  return Object.entries(NAMED_RECOVERY_ERRORS).find(([name]) =>
    new RegExp(`\\b${name}\\b`, 'i').test(String(message)),
  )?.[1];
}

export function formatRecoveryError(errorValue) {
  const message = errorValue?.message || String(errorValue || '');
  const code = recoveryErrorCode(message);
  if (code && RECOVERY_ERROR_MESSAGES[code]) return RECOVERY_ERROR_MESSAGES[code];

  const containsTechnicalTrace = /HostError|Diagnostic Event|recovery proof rejected|simulation failed|Error\(Contract|Contract,\s*#/i.test(message);
  if (errorValue?.isRecoveryApiError || containsTechnicalTrace)
    return FALLBACK_RECOVERY_ERROR;

  return message || FALLBACK_RECOVERY_ERROR;
}
