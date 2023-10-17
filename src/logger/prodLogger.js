const { createLogger, transports, format } = require('winston');
const { combine, timestamp, errors, json } = format;

const prodLogger = () => {
  const customFormat = combine(timestamp(), errors({ stack: true }), json());

  const destinations = [new transports.Console()];
  if (process.env.NODE_ENV === 'production') {
    destinations.push(new transports.File({ filename: 'app.log' }));
  }

  const logger = createLogger({
    transports: destinations,
    level: 'debug',
    format: customFormat,
  });
  return logger;
};

module.exports = prodLogger;
