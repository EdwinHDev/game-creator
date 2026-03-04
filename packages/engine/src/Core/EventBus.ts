/**
 * Global synchronous Event Bus for the engine.
 * Implements a static Publisher/Subscriber pattern.
 */
export class EventBus {
  private static handlers: Map<string, Function[]> = new Map();

  /**
   * Subscribes a callback to a specific event.
   */
  public static on(event: string, callback: Function): void {
    if (!this.handlers.has(event)) {
      this.handlers.set(event, []);
    }
    this.handlers.get(event)!.push(callback);
  }

  /**
   * Unsubscribes a specific callback from an event.
   */
  public static off(event: string, callback: Function): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    const index = handlers.indexOf(callback);
    if (index !== -1) {
      handlers.splice(index, 1);
    }

    if (handlers.length === 0) {
      this.handlers.delete(event);
    }
  }

  /**
   * Dispatches an event to all subscribers synchronously.
   */
  public static emit(event: string, ...args: any[]): void {
    const handlers = this.handlers.get(event);
    if (!handlers) return;

    // We clone the handlers array before execution to avoid issues 
    // if a handler unsubscribes during processing.
    [...handlers].forEach((handler) => {
      try {
        handler(...args);
      } catch (error) {
        console.error(`[EventBus] Error in handler for event "${event}":`, error);
      }
    });
  }

  /**
   * Alias for emit. Dispatches an event to all subscribers.
   */
  public static dispatch(event: string, ...args: any[]): void {
    this.emit(event, ...args);
  }

  /**
   * Alias for on. Subscribes a callback to a specific event.
   */
  public static subscribe(event: string, callback: Function): void {
    this.on(event, callback);
  }

  /**
   * Clears all handlers for all events.
   */
  public static clear(): void {
    this.handlers.clear();
  }
}
