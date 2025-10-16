import * as core from '@actions/core';

/**
 * Structured logger for the action
 */
export class Logger {
  private context: string;

  constructor(context: string) {
    this.context = context;
  }

  private formatMessage(message: string): string {
    return `[${this.context}] ${message}`;
  }

  info(message: string): void {
    core.info(this.formatMessage(message));
  }

  debug(message: string): void {
    core.debug(this.formatMessage(message));
  }

  warning(message: string): void {
    core.warning(this.formatMessage(message));
  }

  error(message: string, error?: Error): void {
    const errorMessage = error
      ? `${this.formatMessage(message)}: ${error.message}`
      : this.formatMessage(message);
    core.error(errorMessage);

    if (error?.stack) {
      core.debug(`Stack trace: ${error.stack}`);
    }
  }

  group(name: string): void {
    core.startGroup(this.formatMessage(name));
  }

  endGroup(): void {
    core.endGroup();
  }
}

/**
 * Creates a logger instance for a specific context
 */
export function createLogger(context: string): Logger {
  return new Logger(context);
}
