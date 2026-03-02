/**
 * Base class for all engine-specific structural errors.
 */
export class EngineError extends Error {
  constructor(message: string) {
    super(message);
    this.name = this.constructor.name;
    Object.setPrototypeOf(this, EngineError.prototype);
  }
}

/**
 * Thrown when the engine encounters an unrecoverable state.
 */
export class EngineCrashError extends EngineError {
  constructor(message: string) {
    super(`[CRITICAL ENGINE CRASH]: ${message}`);
    Object.setPrototypeOf(this, EngineCrashError.prototype);
  }
}

/**
 * Thrown when a piece of functionality is called but not yet implemented.
 */
export class NotImplementedError extends EngineError {
  constructor(featureName: string) {
    super(`Feature not implemented: ${featureName}`);
    Object.setPrototypeOf(this, NotImplementedError.prototype);
  }
}
