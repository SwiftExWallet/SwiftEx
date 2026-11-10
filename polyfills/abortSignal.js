const g = globalThis;
const AS = g.AbortSignal;

if (AS && typeof g.AbortController === 'function') {
  if (typeof AS.timeout !== 'function') {
    AS.timeout = function timeout(ms) {
      const controller = new g.AbortController();
      setTimeout(() => {
        const err = new Error('The operation timed out.');
        err.name = 'TimeoutError';
        controller.abort(err);
      }, ms);
      return controller.signal;
    };
  }

  if (typeof AS.any !== 'function') {
    AS.any = function any(signals) {
      const controller = new g.AbortController();
      const list = Array.from(signals || []);
      for (const s of list) {
        if (s && s.aborted) {
          controller.abort(s.reason);
          return controller.signal;
        }
      }
      const onAbort = (e) => {
        const src = (e && e.target) || list.find((s) => s && s.aborted);
        controller.abort(src ? src.reason : undefined);
      };
      for (const s of list) {
        if (s && typeof s.addEventListener === 'function') {
          s.addEventListener('abort', onAbort);
        }
      }
      return controller.signal;
    };
  }
}
