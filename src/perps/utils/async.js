// Small async helpers for Perps flows (no RN imports).
export const sleep = (ms) => new Promise((res) => setTimeout(res, ms));

// Rejects with Error("timeout") if `p` hasn't settled within `ms` (the underlying work may still
// finish later — callers must treat a timeout as "status unknown", never as "failed").
export const withTimeout = (p, ms) =>
  new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error("timeout")), ms);
    Promise.resolve(p).then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      }
    );
  });
