export const RECOVERY_STEPS = Object.freeze({
  WELCOME: 'welcome',
  SETUP: 'setup',
  ACTIVE: 'active',
  RECOVER: 'recover',
  WAITING: 'waiting',
  TIMELOCK: 'timelock',
  EXECUTING: 'executing',
  READY: 'ready',
  COMPLETE: 'complete',
});

const stepRank = {
  [RECOVERY_STEPS.WAITING]: 0,
  [RECOVERY_STEPS.TIMELOCK]: 1,
  [RECOVERY_STEPS.READY]: 2,
  [RECOVERY_STEPS.EXECUTING]: 3,
  [RECOVERY_STEPS.COMPLETE]: 4,
};

export function nextRecoveryStep({currentStep, status, hasUnlockAt}) {
  if (status === 'COMPLETED') return RECOVERY_STEPS.COMPLETE;
  if (status === 'FAILED') return RECOVERY_STEPS.WAITING;

  const nextStep =
    status === 'PENDING' && hasUnlockAt
      ? RECOVERY_STEPS.TIMELOCK
      : status === 'STARTED'
        ? RECOVERY_STEPS.WAITING
        : status === 'EXECUTING'
          ? RECOVERY_STEPS.EXECUTING
          : currentStep;

  if ((stepRank[nextStep] ?? -1) < (stepRank[currentStep] ?? -1)) {
    return currentStep;
  }
  return nextStep;
}

export function recoveryStepOnResume({
  isRegistered,
  initialStep,
  status,
  unlockAt,
}) {
  const currentStep = isRegistered ? RECOVERY_STEPS.ACTIVE : initialStep;
  if (!isRegistered || !status) return currentStep;

  return nextRecoveryStep({
    currentStep,
    status,
    hasUnlockAt: Boolean(unlockAt),
  });
}

export function recoveryStatusNotice(status) {
  return {
    STARTED: 'Recovery request received. Waiting for email verification.',
    PENDING: 'Recovery email verified. Starting the safety timelock.',
    EXECUTING: 'Recovery execution is in progress.',
    COMPLETED: 'Recovery completed successfully.',
  }[status] || '';
}
