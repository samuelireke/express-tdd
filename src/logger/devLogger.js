const { createLogger, transports, format } = require('winston');
const { combine, timestamp, colorize, errors, printf } = format;

const devLogger = () => {
  const customFormat = combine(
    colorize(),
    timestamp(),
    errors({ stack: true }),
    printf((info) => {
      const { timestamp, level, message, stack } = info;
      return `${timestamp} [${level}] : ${stack || message}`;
    }),
  );

  const logger = createLogger({
    transports: new transports.Console(),
    level: 'debug',
    format: customFormat,
    silent:
      process.env.NODE_ENV === 'test' || process.env.NODE_ENV === 'staging',
  });
  return logger;
};

module.exports = devLogger;
