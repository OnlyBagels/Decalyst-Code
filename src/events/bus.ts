import { EventEmitter } from "eventemitter3";
import type { EventByType, SessionEvent } from "./types.js";

type EventMap = {
  [E in SessionEvent as E["t"]]: [event: E];
};

export class EventBus {
  private emitter: EventEmitter<EventMap>;
  private handlers: Map<SessionEvent["t"], Map<Function, Function>> = new Map();

  constructor() {
    this.emitter = new EventEmitter<EventMap>();
  }

  on<T extends SessionEvent["t"]>(
    eventType: T,
    handler: (event: EventByType<T>) => void,
  ): () => void {
    const listener = (event: EventByType<T>) => handler(event);

    if (!this.handlers.has(eventType)) {
      this.handlers.set(eventType, new Map());
    }
    this.handlers.get(eventType)!.set(handler as Function, listener);

    this.emitter.on(eventType, listener as any);
    return () => this.off(eventType, handler);
  }

  off<T extends SessionEvent["t"]>(
    eventType: T,
    handler: (event: EventByType<T>) => void,
  ): void {
    const handlerMap = this.handlers.get(eventType);
    if (!handlerMap) return;

    const listener = handlerMap.get(handler as Function);
    if (listener) {
      this.emitter.off(eventType, listener as any);
      handlerMap.delete(handler as Function);
    }
  }

  emit(event: SessionEvent): void {
    this.emitter.emit(event.t as any, event);
  }

  removeAllListeners(): void {
    this.emitter.removeAllListeners();
    this.handlers.clear();
  }
}
