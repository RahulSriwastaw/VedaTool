type WSMessageCallback = (type: string, data: any) => void;

export class WebSocketConnectionManager {
  private url: string;
  private ws: WebSocket | null = null;
  private retryCount = 0;
  private maxRetries = 50;
  private onMessage: WSMessageCallback;
  private onClose: () => void;
  private onOpen: () => void;
  private pendingClose = false;
  private connectTimeoutTimer: any = null;
  private connectTimeoutDuration = 10000; // 10-second early timeout to prevent hanging system or ERR_CONNECTION_TIMED_OUT

  constructor(url: string, onMessage: WSMessageCallback, onClose: () => void, onOpen: () => void) {
    this.url = url;
    this.onMessage = onMessage;
    this.onClose = onClose;
    this.onOpen = onOpen;
  }

  connect() {
    if (this.ws && (this.ws.readyState === WebSocket.CONNECTING || this.ws.readyState === WebSocket.OPEN)) {
      return;
    }
    
    this.pendingClose = false;

    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }

    console.log("[WSManager] Initiating WebSocket connection to:", this.url);
    this.ws = new WebSocket(this.url);

    // Setup active connection timeout to abort long hanging connections and trigger backoff early
    this.connectTimeoutTimer = setTimeout(() => {
      if (this.ws && this.ws.readyState !== WebSocket.OPEN) {
        console.warn("[WSManager] Connection attempt timed out. Aborting to trigger immediate reconnection strategy.");
        this.ws.close();
      }
    }, this.connectTimeoutDuration);

    this.ws.onopen = () => {
      console.log("[WSManager] Connected successfully to", this.url);
      this.retryCount = 0;
      if (this.connectTimeoutTimer) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }
      this.onOpen();
    };

    this.ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        this.onMessage(data.type, data);
      } catch (err) {
        console.error("[WSManager] Failed to parse message", err);
      }
    };

    this.ws.onerror = (err) => {
      console.error("[WSManager] WebSocket error observed:", err);
    };

    this.ws.onclose = () => {
      console.log("[WSManager] WebSocket closed");
      this.ws = null;
      if (this.connectTimeoutTimer) {
        clearTimeout(this.connectTimeoutTimer);
        this.connectTimeoutTimer = null;
      }

      if (!this.pendingClose && this.retryCount < this.maxRetries) {
        this.retryCount++;
        // Exponential backoff: base delay of 1s, doubling up to 30s, with custom jitter
        const baseDelay = 1000 * Math.pow(2, this.retryCount - 1);
        const jitter = Math.random() * 1000;
        const backoffTime = Math.min(baseDelay + jitter, 30000);
        
        console.log(`[WSManager] Retrying connection in ${Math.round(backoffTime)}ms (Attempt ${this.retryCount}/${this.maxRetries})...`);
        setTimeout(() => this.connect(), backoffTime);
      } else {
        this.onClose();
      }
    };
  }

  send(payload: any) {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) {
      this.ws.send(JSON.stringify(payload));
    } else {
      console.warn("[WSManager] Cannot send message, WebSocket is not open.");
    }
  }

  close() {
    this.pendingClose = true;
    if (this.connectTimeoutTimer) {
      clearTimeout(this.connectTimeoutTimer);
      this.connectTimeoutTimer = null;
    }
    if (this.ws) {
      this.ws.close();
      this.ws = null;
    }
  }
}
