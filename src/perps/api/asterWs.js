import { AppState } from "react-native";

// Single shared Aster market WebSocket.
// - Base streams are in the URL; extra streams (e.g. btcusdt@kline_1h) use SUBSCRIBE/UNSUBSCRIBE.
// - Opens only while someone listens; closes shortly after the last listener leaves
//   (Perps screens unsubscribe on blur) and whenever the app goes to the background.
// - Reconnects with exponential backoff and re-subscribes extra streams.
const WS_URL = "wss://fstream.asterdex.com/stream?streams=";
export const BASE_STREAMS = ["!ticker@arr", "!markPrice@arr@1s"];

const CLOSE_GRACE_MS = 1500; // avoid close/reopen churn when moving between Perps screens
const BACKOFF_START_MS = 1000;
const BACKOFF_MAX_MS = 30000;

class AsterWsManager {
  constructor() {
    this.socket = null;
    this.listeners = new Map(); // stream -> Set<fn(data)>
    this.extraStreams = new Set(); // subscribed via SUBSCRIBE on the current socket
    this.reconnectTimer = null;
    this.closeTimer = null;
    this.backoff = BACKOFF_START_MS;
    this.appState = AppState.currentState;
    this.requestId = 1;
    this.stats = { opens: 0, closes: 0, errors: 0, messages: 0, lastEvent: "init" };
    AppState.addEventListener("change", this.handleAppState);
  }

  // Public: listen to a stream. Returns an unsubscribe function.
  subscribe(stream, fn) {
    if (!this.listeners.has(stream)) this.listeners.set(stream, new Set());
    this.listeners.get(stream).add(fn);
    if (this.closeTimer) {
      clearTimeout(this.closeTimer);
      this.closeTimer = null;
    }
    if (!BASE_STREAMS.includes(stream)) this.sendSubscribe(stream);
    this.ensureOpen();

    return () => {
      const set = this.listeners.get(stream);
      if (!set) return;
      set.delete(fn);
      if (set.size === 0) {
        this.listeners.delete(stream);
        if (!BASE_STREAMS.includes(stream)) this.sendUnsubscribe(stream);
      }
      if (this.listeners.size === 0) this.scheduleClose();
    };
  }

  getDebugInfo() {
    return {
      state: this.socket ? ["CONNECTING", "OPEN", "CLOSING", "CLOSED"][this.socket.readyState] : "NONE",
      listeners: Array.from(this.listeners.keys()),
      extraStreams: Array.from(this.extraStreams),
      appState: this.appState,
      ...this.stats,
    };
  }

  hasListeners() {
    return this.listeners.size > 0;
  }

  ensureOpen() {
    if (this.socket || this.appState !== "active" || !this.hasListeners()) return;
    if (this.reconnectTimer) return; // a reconnect is already scheduled
    this.open();
  }

  open() {
    let socket;
    try {
      socket = new WebSocket(WS_URL + BASE_STREAMS.join("/"));
    } catch (e) {
      this.stats.errors += 1;
      this.scheduleReconnect();
      return;
    }
    this.socket = socket;
    this.extraStreams = new Set();

    socket.onopen = () => {
      if (this.socket !== socket) return;
      this.stats.opens += 1;
      this.stats.lastEvent = "open";
      this.backoff = BACKOFF_START_MS;
      this.listeners.forEach((_, stream) => {
        if (!BASE_STREAMS.includes(stream)) this.sendSubscribe(stream);
      });
    };

    socket.onmessage = (event) => {
      if (this.socket !== socket) return;
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch (e) {
        return;
      }
      if (!msg || !msg.stream) return; // SUBSCRIBE replies etc.
      this.stats.messages += 1;
      const set = this.listeners.get(msg.stream);
      if (!set) return;
      set.forEach((fn) => {
        try {
          fn(msg.data);
        } catch (e) {
          // a listener error must not break the socket
        }
      });
    };

    socket.onerror = () => {
      if (this.socket !== socket) return;
      this.stats.errors += 1;
      this.stats.lastEvent = "error";
    };

    socket.onclose = () => {
      if (this.socket !== socket) return; // closed on purpose by us
      this.socket = null;
      this.extraStreams = new Set();
      this.stats.closes += 1;
      this.stats.lastEvent = "dropped";
      this.scheduleReconnect();
    };
  }

  scheduleReconnect() {
    if (this.reconnectTimer || this.appState !== "active" || !this.hasListeners()) return;
    const delay = this.backoff;
    this.backoff = Math.min(this.backoff * 2, BACKOFF_MAX_MS);
    this.reconnectTimer = setTimeout(() => {
      this.reconnectTimer = null;
      this.ensureOpen();
    }, delay);
  }

  scheduleClose() {
    if (this.closeTimer) clearTimeout(this.closeTimer);
    this.closeTimer = setTimeout(() => {
      this.closeTimer = null;
      if (!this.hasListeners()) this.close("no listeners");
    }, CLOSE_GRACE_MS);
  }

  close(reason) {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    const socket = this.socket;
    this.socket = null;
    this.extraStreams = new Set();
    if (socket) {
      socket.onopen = socket.onmessage = socket.onerror = socket.onclose = null;
      try {
        socket.close();
      } catch (e) {
        // ignore
      }
      this.stats.closes += 1;
    }
    this.stats.lastEvent = `closed: ${reason}`;
  }

  sendSubscribe(stream) {
    if (!this.socket || this.socket.readyState !== 1 || this.extraStreams.has(stream)) return;
    this.extraStreams.add(stream);
    this.socket.send(JSON.stringify({ method: "SUBSCRIBE", params: [stream], id: this.requestId++ }));
  }

  sendUnsubscribe(stream) {
    if (!this.extraStreams.has(stream)) return;
    this.extraStreams.delete(stream);
    if (!this.socket || this.socket.readyState !== 1) return;
    this.socket.send(JSON.stringify({ method: "UNSUBSCRIBE", params: [stream], id: this.requestId++ }));
  }

  handleAppState = (next) => {
    const prev = this.appState;
    this.appState = next;
    if (next === "active" && prev !== "active") {
      this.backoff = BACKOFF_START_MS;
      this.ensureOpen();
    } else if (next === "background") {
      this.close("app background");
    }
  };
}

export const asterWs = new AsterWsManager();
