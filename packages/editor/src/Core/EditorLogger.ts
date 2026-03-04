export enum LogLevel { INFO, WARN, ERROR, CRITICAL }

export class EditorLogger {
  private static readonly prefix = '[Editor]';

  public static info(message: string, ...args: any[]): void { this.log(LogLevel.INFO, message, ...args); }
  public static warn(message: string, ...args: any[]): void { this.log(LogLevel.WARN, message, ...args); }
  public static error(message: string, ...args: any[]): void { this.log(LogLevel.ERROR, message, ...args); }

  public static critical(message: string, ...args: any[]): never {
    this.log(LogLevel.CRITICAL, message, ...args);
    throw new Error(`Editor Critical Error: ${message}`); // Usamos Error estándar para el editor
  }

  private static log(level: LogLevel, message: string, ...args: any[]): void {
    const timestamp = new Date().toISOString();
    const formattedMessage = `${this.prefix} [${timestamp}] [${LogLevel[level]}]: ${message}`;

    switch (level) {
      case LogLevel.INFO: console.info(formattedMessage, ...args); break;
      case LogLevel.WARN: console.warn(formattedMessage, ...args); break;
      case LogLevel.ERROR: console.error(formattedMessage, ...args); break;
      case LogLevel.CRITICAL: console.error(`%c${formattedMessage}`, 'color: white; background: red; font-weight: bold;', ...args); break;
    }
  }
}
