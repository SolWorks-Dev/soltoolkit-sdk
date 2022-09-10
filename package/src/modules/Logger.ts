import { ILogger } from '../interfaces/ILogger';

export class Logger implements ILogger {
    private module: string;
    public constructor(module: string) {
        this.module = module;
    }
    public debug(...args: any[]): void {
        console.debug(`${new Date().toISOString()} - [${this.module}] - DEBUG -`, ...args);
    }
    public info(...args: any[]): void {
        console.info(`${new Date().toISOString()} - [${this.module}] - INFO -`, ...args);
    }
    public warn(...args: any[]): void {
        console.warn(`${new Date().toISOString()} - [${this.module}] - WARN -`, ...args);
    }
    public error(...args: any[]): void {
        console.error(`${new Date().toISOString()} - [${this.module}] - ERROR -`, ...args);
    }
    public makeError(...args: any[]): Error {
        return new Error(...args);
    }
}