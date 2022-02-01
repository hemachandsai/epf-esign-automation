const { createLogger, format, transports } = require('winston');
const { timestamp, printf } = format;

const myFormat = printf( ({ level, message, timestamp }) => {
    let msg = `${timestamp} [${level}] => ${message} `  
    return msg
});

const logger = createLogger({
  level: 'info',
  format: format.combine(
    format.colorize(),
    timestamp(),
    myFormat
  ),
  transports: [
    new transports.File({ filename: 'epf-automation-detailed.log', level: 'debug' }),
    new transports.Console({level: 'info'})
  ],
});

module.exports = logger;