import { EventBus } from './EventBus';

/**
 * The universal base class for all engine objects.
 * Features a unique ID and a reactive name property.
 */
export class UObject {
  /**
   * Universal unique identifier for the object.
   */
  public readonly id: string;

  private _name: string;

  /**
   * @param name The initial name of the object.
   */
  constructor(name: string = 'NewObject') {
    this.id = this.generateUUID();
    this._name = name;
  }

  /**
   * The human-readable name of the object.
   * Emits "ObjectRenamed" via EventBus when changed.
   */
  public get name(): string {
    return this._name;
  }

  public set name(newName: string) {
    if (this._name === newName) return;
    this._name = newName;
    EventBus.emit("ObjectRenamed", this);
  }

  /**
   * Internal helper to generate a unique ID.
   * Uses crypto.randomUUID() if available with a fallback.
   */
  protected generateUUID(): string {
    if (typeof crypto !== 'undefined' && crypto.randomUUID) {
      return crypto.randomUUID();
    }

    // Fallback: Random string based on Math.random and timestamps 
    // for non-crypto secure environments (e.g., some CI or older browsers).
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = (Math.random() * 16) | 0;
      const v = c === 'x' ? r : (r & 0x3) | 0x8;
      return v.toString(16);
    });
  }
}
