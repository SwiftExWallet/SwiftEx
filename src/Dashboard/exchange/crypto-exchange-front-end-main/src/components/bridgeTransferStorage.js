import AsyncStorage from '@react-native-async-storage/async-storage';

const STORAGE_PREFIX = '@swiftEx/bridge-transfer/';
const storageQueues = new Map();

export function isTerminalBridgeStatus(status) {
  return status === 'COMPLETED' || status === 'FAILED';
}

export function isMissingBridgeTransferError(error) {
  return error?.status === 404;
}

export function isInsufficientGasError(error) {
  return (
    error?.status === 400 &&
    /insufficient native balance for gas/i.test(error?.message || '')
  );
}

function storageKey(direction, walletScope) {
  return walletScope
    ? `${STORAGE_PREFIX}${direction}/${walletScope}`
    : `${STORAGE_PREFIX}${direction}`;
}

function enqueueStorageOperation(direction, walletScope, operation) {
  const key = storageKey(direction, walletScope);
  const previous = storageQueues.get(key) || Promise.resolve();
  const task = previous.catch(() => undefined).then(operation);
  storageQueues.set(key, task);
  task
    .finally(() => {
      if (storageQueues.get(key) === task) storageQueues.delete(key);
    })
    .catch(() => undefined);
  return task;
}

export async function saveBridgeTransfer(direction, transfer, walletScope) {
  if (!direction || !transfer?.id || !transfer?.status) return;

  return enqueueStorageOperation(direction, walletScope, () =>
    AsyncStorage.setItem(
      storageKey(direction, walletScope),
      JSON.stringify({
        id: transfer.id,
        status: transfer.status,
        direction,
      }),
    ),
  );
}

export async function clearSavedBridgeTransfer(direction, walletScope) {
  if (!direction) return;
  return enqueueStorageOperation(direction, walletScope, () =>
    AsyncStorage.removeItem(storageKey(direction, walletScope)),
  );
}

async function discardSavedBridgeTransfer(direction, walletScope) {
  try {
    await clearSavedBridgeTransfer(direction, walletScope);
  } catch (_) {}
}

export async function getSavedBridgeTransfer(direction, walletScope) {
  if (!direction) return null;

  try {
    const raw = await AsyncStorage.getItem(storageKey(direction, walletScope));
    if (!raw) return null;

    const saved = JSON.parse(raw);
    if (
      !saved?.id ||
      !saved?.status ||
      saved.direction !== direction ||
      isTerminalBridgeStatus(saved.status)
    ) {
      await discardSavedBridgeTransfer(direction, walletScope);
      return null;
    }

    return saved;
  } catch (_) {
    await discardSavedBridgeTransfer(direction, walletScope);
    return null;
  }
}
