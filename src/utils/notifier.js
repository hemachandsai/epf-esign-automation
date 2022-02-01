const notifier = require("node-notifier");
const logger = require("./logger");

function showNotification(message) {
  logger.debug(`Showing desktop notification with message: ${message}`);
  notifier.notify({
    title: "EPF E-Nomination Update",
    message: message,
    sound: true,
    appID: "EPF Automation",
    timeout: 5,
    //   actions: ['OK', 'Cancel']
  });
}

module.exports = showNotification;
