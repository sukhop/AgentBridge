import fs from 'node:fs';
import path from 'node:path';
import winston from 'winston';

export function createLogger(config) {
  const logDir = path.join(config.rootDir, 'logs');
  fs.mkdirSync(logDir, { recursive: true });

  const format = winston.format.combine(
    winston.format.timestamp(),
    winston.format.errors({ stack: true }),
    winston.format.splat(),
    winston.format.json()
  );

  return winston.createLogger({
    level: config.logLevel,
    defaultMeta: { service: 'agremote' },
    format,
    transports: [
      new winston.transports.Console({
        format: winston.format.combine(
          winston.format.colorize(),
          winston.format.simple()
        )
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'agremote.log'),
        maxsize: 5_000_000,
        maxFiles: 5
      }),
      new winston.transports.File({
        filename: path.join(logDir, 'error.log'),
        level: 'error',
        maxsize: 5_000_000,
        maxFiles: 5
      })
    ]
  });
}
