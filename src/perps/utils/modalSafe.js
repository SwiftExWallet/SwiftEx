// iOS can present only ONE native modal at a time: presenting one (CustomInfoProvider, Alert,
// another sheet) while a perps modal is still visible or still animating out fails silently and
// leaves an invisible layer that blocks every touch ("app frozen"). Android tolerates it.
//
// Rules used by all perps screens:
//  - every perps modal reports open / fully hidden here (useModalPresence),
//  - info dialogs go through showInfo(): shown right away only if no perps modal is open or
//    dismissing; otherwise queued and shown once the last one has fully hidden,
//  - a button in an info dialog runs its action only after the dialog has faded out, so the
//    action can open a sheet or another dialog safely.
import { useEffect, useRef } from "react";
import CustomInfoProvider from "../../Dashboard/exchange/crypto-exchange-front-end-main/src/components/CustomInfoProvider";

const INFO_FADE_MS = 450; // CustomInfoProvider uses animationType="fade" (~300ms) + margin
const RN_MODAL_HIDE_MS = 550; // RN <Modal> slide/fade out when no onDismiss (Android)

const open = new Set(); // ids of perps modals visible or still dismissing
let queue = [];
let infoBusyUntil = 0;
let flushTimer = null;
let seq = 0;

const isDev = typeof __DEV__ !== "undefined" && __DEV__;

const flush = () => {
  flushTimer = null;
  if (open.size > 0 || queue.length === 0) return;
  const wait = infoBusyUntil - Date.now();
  if (wait > 0) {
    flushTimer = setTimeout(flush, wait + 20);
    return;
  }
  // Only the latest message matters if several were queued (e.g. error then refresh).
  const next = queue[queue.length - 1];
  queue = [];
  present(next);
};

const scheduleFlush = () => {
  if (!flushTimer) flushTimer = setTimeout(flush, 0);
};

const wrapButtons = (buttons) =>
  Array.isArray(buttons)
    ? buttons.map((b) => ({
        ...b,
        onPress: () => {
          // The dialog is closing: run the action after its fade-out.
          infoBusyUntil = Date.now() + INFO_FADE_MS;
          if (b.onPress) setTimeout(b.onPress, INFO_FADE_MS);
        },
      }))
    : buttons;

const present = ({ type, title, message, buttons }) => {
  if (isDev && open.size > 0) {
    // Dev-only assertion: this would freeze iOS.
    // eslint-disable-next-line no-console
    console.warn(`[perps] info "${title}" shown while modals open: ${Array.from(open).join(",")}`);
  }
  CustomInfoProvider.show(type, title, message, wrapButtons(buttons));
};

// Show an info / confirm dialog safely (now, or after the open perps modals have hidden).
export const showInfo = (type, title, message, buttons) => {
  const item = { type, title, message, buttons };
  if (open.size === 0 && Date.now() >= infoBusyUntil) present(item);
  else {
    queue.push(item);
    if (open.size === 0) scheduleFlush();
  }
};

export const isAnyPerpsModalOpen = () => open.size > 0;

const markOpen = (id) => open.add(id);
const markHidden = (id) => {
  if (open.delete(id) && open.size === 0) scheduleFlush();
};

// Track one modal. kind 'rnm' = react-native-modal (use the returned onModalHide),
// kind 'rn' = RN <Modal> (hidden after RN_MODAL_HIDE_MS, or onDismiss on iOS).
// Returns props to spread / pass: { onModalHide, onDismiss }.
export const useModalPresence = (visible, kind = "rnm") => {
  const idRef = useRef(null);
  if (!idRef.current) {
    seq += 1;
    idRef.current = `m${seq}`;
  }
  const id = idRef.current;
  const timer = useRef(null);
  useEffect(() => {
    if (visible) {
      if (timer.current) clearTimeout(timer.current);
      markOpen(id);
    } else if (open.has(id) && kind === "rn") {
      timer.current = setTimeout(() => markHidden(id), RN_MODAL_HIDE_MS);
    } else if (open.has(id) && kind === "rnm") {
      // Safety net if onModalHide never fires (e.g. unmounted mid-animation).
      timer.current = setTimeout(() => markHidden(id), 1500);
    }
  }, [visible, id, kind]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
      // Unmounted while shown: the native modal is still animating out — wait before releasing.
      if (open.has(id)) setTimeout(() => markHidden(id), kind === "rn" ? RN_MODAL_HIDE_MS : 450);
    },
    [id, kind]
  );
  const hidden = () => {
    if (timer.current) clearTimeout(timer.current);
    markHidden(id);
  };
  return { onModalHide: hidden, onDismiss: hidden };
};

// Test hooks (pure bookkeeping; used by __tests__/modalSafe.test.js).
export const __test = { markOpen, markHidden, reset: () => { open.clear(); queue = []; infoBusyUntil = 0; } };
