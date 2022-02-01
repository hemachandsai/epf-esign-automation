const readline = require("readline");
const colors = require("colors/safe");
const { program } = require("commander");
const Nightmare = require("nightmare");
const logger = require("./utils/logger");
const showNotification = require("./utils/notifier");

const appConfig = {
  maxDelayInterval: 5,
  failedAttempts: 0,
  otpRetries: 0,
};
let UAN, PASSWORD, AADHAAR, OTP;
let cliOptions, nightmareInstance, inputInterface;

function getDelayIntervalInMinutes() {
  logger.debug(`getDelayIntervalInMinutes Invoked`);

  return Math.min(appConfig.failedAttempts + 1, appConfig.maxDelayInterval);
}

function validateField(fieldName) {
  logger.debug(`validateField Invoked with args: fieldName=${fieldName}`);

  const fieldValue = this.valueOf();
  switch (fieldName) {
    case "UAN":
      if (!fieldValue || fieldValue.length !== 12) {
        console.log(colors.red("Invalid UAN value. Please check and input again"));
        return false;
      }
      break;
    case "PASSWORD":
      if (!fieldValue) {
        console.log(colors.red("Please enter a valid value for password"));
        return false;
      }
      break;
    case "AADHAAR":
      if (!fieldValue || fieldValue.length !== 12) {
        console.log(colors.red("Invalid Aadhaar value. Please check and input again"));
        return false;
      }
      break;
    case "OTP":
      if (!fieldValue || fieldValue.length !== 6) {
        console.log(colors.red("Invalid OTP. Please check and input again"));
        return false;
      }
      break;
  }
  return true;
}
String.prototype.validateField = validateField;

function wrapQuestionAsPromiseANDValidate(questionData) {
  logger.debug(`wrapQuestionAsPromiseANDValidate Invoked with args: questionData=${questionData}`);

  return new Promise((resolve, _) => {
    const askQuestion = () => {
      inputInterface.question(colors.green(`${questionData} : `), function (inputRecieved) {
        const isValid = inputRecieved.validateField(questionData);
        if (isValid === false) {
          askQuestion();
        } else {
          resolve(inputRecieved);
        }
      });
    };
    askQuestion();
  });
}

async function promptForUserDetails() {
  logger.debug(`promptForUserDetails Invoked`);

  inputInterface = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
  if (UAN && PASSWORD && AADHAAR) {
    console.log(colors.magenta("PLEASE ENTER THE OTP RECIEVED ON YOUR MOBILE: "));
    OTP = await wrapQuestionAsPromiseANDValidate("OTP");
  } else {
    console.log(colors.magenta("PLEASE ENTER THE BELOW DETAILS REQUIRED TO AUTOMATE ESIGN PROCESS IN EPF PORTAL: "));
    if (!UAN) UAN = await wrapQuestionAsPromiseANDValidate("UAN");
    if (!PASSWORD) PASSWORD = await wrapQuestionAsPromiseANDValidate("PASSWORD");
    if (!AADHAAR) AADHAAR = await wrapQuestionAsPromiseANDValidate("AADHAAR");
  }
}

function initNightmare() {
  logger.debug(`initNightmare Invoked`);

  nightmareInstance = Nightmare({
    show: cliOptions["showBrowser"],
    loadTimeout: 60000,
    gotoTimeout: 30000,
    waitTimeout: 60000,
  }).useragent(
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/97.0.4692.99 Safari/537.36"
  );
}

async function captureErrorScreenshot() {
  logger.debug(`captureErrorScreenshot Invoked`);
  logger.info("Capturing screenshot of the current page.");

  await nightmareInstance
    .screenshot("./epf-automation-error-screenshot.png")
    .catch((error) => logger.error(`Error while trying to capture screenshot. Description:\n`, error));

  logger.error(
    `Encountered error during esign process. Captured a screenshot and saved it as epf-automation-error-screenshot.png in the current directory.`
  );
}

async function constructEPFErrorMessage() {
  logger.debug(`constructEPFErrorMessage Invoked`);
  return await nightmareInstance
    .evaluate(() => {
      const pageTitle = document.querySelector("title") && document.querySelector("title").innerText;
      const pageURL = window.location.href;
      let errorMsg;
      if (!pageTitle) {
        errorMsg = `EPF Page is either un-responsive or not loaded completely within given time`;
      } else if (
        pageTitle === "Service Unavailable" &&
        document.querySelector(".alert.alert-danger h4") &&
        document.querySelector(".alert.alert-danger h4").innerText === "This facility is temporarily under maintenance."
      ) {
        errorMsg = `Esign page is currently under maintenance`;
      } else if (document.querySelector("h1") && document.querySelector("h1").innerText.match(/Service Unavailable/)) {
        errorMsg = `EPF website is currently unavailable because of maintenance downtime or capacity
            problems`;
      } else if (pageTitle === "ERROR") {
        errorMsg = "Landed on unexpected error page";
      } else {
        errorMsg = "Uncategorized error!!";
      }
      return `Error Message: ${errorMsg}\nCurrent Page Title: ${pageTitle}\nCurrent Page URL: ${pageURL}`;
    })
    .catch((error) => logger.error(`Something went wrong while constructing error message. Error:\n`, error));
}

async function navigateToEPFSite() {
  logger.debug(`navigateToEPFSite Invoked`);
  logger.info("Navigating to EPF Website");

  await nightmareInstance.goto("https://unifiedportal-mem.epfindia.gov.in/memberinterface/");
}

async function loginToEPFSite() {
  logger.debug(`loginToEPFSite Invoked`);
  logger.info("Trying to login to EPF Wesbite with the given credentials");

  await nightmareInstance
    .wait("#userName")
    .wait(500)
    .type("#userName", UAN)
    .type("#password", PASSWORD)
    .click(".btn.btn-success.btn-logging")
    .wait(() => {
      if (document.querySelector(".alert.alert-warning:not(.hide)") || document.querySelector(".uan-face")) {
        return true;
      }
    })
    .evaluate(() => {
      const errorElement = document.querySelector(".alert.alert-warning:not(.hide)");
      if (errorElement) {
        return `Error encountered during login process to epf website. Either UAN Number or Password entered is invalid. Please restart the program with correct credentials. Here is the error from EPF wesbite:\n${errorElement.innerText}`;
      }
      return "";
    })
    .then(async (errorMessage) => {
      if (errorMessage) {
        logger.error(errorMessage);
        await enterNOOPNode();
      }
    });
}

// NOOP mode is created as an alternative to process.exit(1) as process.exit exists CLI/Shell when invoked through binary. As a result user wont be able to see the error printed
async function enterNOOPNode() {
  return new Promise(async () => {
    setInterval(() => {}, 1000);
    await nightmareInstance.end();
    showNotification("Error Encountered. Please check CLI logs for more info. Entering NOOP Mode!!!");
    logger.error(
      "Entered NOOP Mode. Something went wrong, please have a look at the above error message and restart the program. Sometimes it could be an false error too, please re run the program to confirm."
    );
  });
}

async function clickOnFileNowInModalWindow() {
  logger.debug(`clickOnFileNowInModalWindow Invoked`);
  logger.info("Clicking on FileNow Option in Modal window.");

  await nightmareInstance
    .wait(".modal-footer .btn.btn-success")
    .click(".modal-footer .btn.btn-success")
    .catch(async (error) => {
      logger.error(
        `Error while trying to perform clickOnFileNowInModalWindow as eNomination modal window is not displayed. Performing navbar menu click. Error:\n`,
        error
      );
      await nightmareInstance.click("#divMenuBar ul.nav.navbar-nav li:nth-child(3) ul li:nth-child(4) a");
    });
}

async function clickOnEsign() {
  logger.debug(`clickOnEsign Invoked`);
  logger.info("Clicking on Esign Option in E-Nomaination page");

  await nightmareInstance
    .wait(1000)
    .wait(() => {
      const esignElement = document.querySelector("#pendingNominationDetails tbody tr a");
      if (esignElement) {
        return true;
      }
    })
    .click("#pendingNominationDetails tbody tr td:nth-child(4) a")
    .catch(async (error) => {
      logger.error(
        `Error while trying to perform clickOnEsign. No past nomination record found. Please submit your nomination details first and then use this tool to automate esign process. Error:\n`,
        error
      );
      await enterNOOPNode();
    });
  logger.info("Done clicking on Esign Option. Waiting to navigate to C-DAC's eSign Service");

  await nightmareInstance.wait("#modalAppletESignModal #appletContainer").wait(() => {
    const modalWindow = document.querySelector("#modalAppletESignModal #appletContainer");
    if (!modalWindow || !modalWindow.innerText.match(/(Processing|in progress)/)) {
      return true;
    }
  });
}

async function giveAadhaarConsent() {
  logger.debug(`giveAadhaarConsent Invoked`);

  logger.info("Landed in Aadhaar Consent Page. Ticking the checkbox.");
  await nightmareInstance.wait(1000).wait("input#userConsentXML").click("input#userConsentXML");

  logger.info("Landed in Aadhaar OTP Page. Entering Aadhaar details and triggering OTP.");
  await nightmareInstance
    .wait(1000)
    .wait("input#check_aadhaar")
    .click("input#check_aadhaar")
    .type("#VidId", AADHAAR)
    .click("#getOtpId")
    .wait(() => {
      const errorElement = document.querySelector("#msg");
      const processingElement = document.querySelector("#loadMe .modal-body .loader-txt");
      const otpSentElement = document.querySelector("#infoId");
      if (errorElement && errorElement.innerText) {
        throw new Error("Invalid Aadhaar Number. Please restart the application with correct details");
      } else if (otpSentElement && otpSentElement.innerText.match(/OTP has been sent/)) {
        return true;
      } else if (processingElement && processingElement.innerText.match(/we are processing your request/)) {
        // do nothing request is being processed
      } else {
        console.log(
          "unexp case",
          errorElement && errorElement.innerText,
          otpSentElement && otpSentElement.innerText,
          processingElement && processingElement.innerText
        );
        // throw new Error("Landed in an unexpected case while trying to give consent for Aadhaar verification. Exiting current submission flow")
      }
    })
    .evaluate(() => {
      const otpSentElement = document.querySelector("#infoId");
      if (otpSentElement && otpSentElement.innerText.match(/OTP has been sent/)) {
        return otpSentElement.innerText;
      }
    })
    .then((otpMessage) =>
      logger.info(
        `Clicked on Send OTP. Please check your mobile and enter the OTP recieved. Here is the message from EPF Portal:\n${otpMessage}`
      )
    );
}

async function promptAndSubmitOTP() {
  logger.debug(`promptAndSubmitOTP Invoked`);
  logger.info("Landed in OTP page. Prompting for OTP...");

  showNotification("OTP is sent your mobile number. Please enter it in the CLI window...");
  await promptForUserDetails();

  await nightmareInstance
    .wait("#OTPId")
    .type("#OTPId", OTP)
    .click("#chkId")
    .click("#OTPSubmit")
    .wait((currentURL) => {
      const errorElement = document.querySelector("#msg");
      if (window.location.href !== currentURL || (errorElement && errorElement.innerText)) return true;
    }, await nightmareInstance.url())
    .evaluate(() => {
      const errorElement = document.querySelector("#msg");
      if (errorElement && errorElement.innerText) {
        return errorElement.innerText;
      }
      return "";
    })
    .then(async (errorMessage) => {
      if (errorMessage ** appConfig.otpRetries < 2) {
        appConfig.otpRetries++;
        log.error(
          `Error encountered while trying to submit OTP. Please check and re-enter again. Here is the error message from EPF site: ${errorMessage}`
        );
      } else if (errorMessage && appConfig.otpRetries >= 2) {
        appConfig.otpRetries = 0;
        log.error(
          `Error encountered while trying to submit OTP. Triggering Resend OTP. Here is the error message from EPF site: ${errorMessage}`
        );
        await nightmareInstance.wait(30000).click("#rsOtp");
      }
      await promptAndSubmitOTP();
    });
}

async function intiateESIGNProcess() {
  logger.debug(`intiateESIGNProcess Invoked`);
  logger.info(
    "Initiating ESign Process. Please wait till all the sequence of steps are completed and this may take a while. You can leave this program running in background and it notifies through notifications."
  );
  try {
    initNightmare();

    await navigateToEPFSite();
    await loginToEPFSite();
    await clickOnFileNowInModalWindow();
    await clickOnEsign();
    await giveAadhaarConsent();
    await promptAndSubmitOTP();
  } catch (error) {
    appConfig.failedAttempts++;
    await captureErrorScreenshot();

    logger.info(`Current failed attempts count: ${appConfig.failedAttempts}`);
    logger.error(
      "Error caught in Esign Process. Mostly this could be because of network issue or unresponsive EPF website. Error Description:\n",
      error
    );
    logger.error(await constructEPFErrorMessage());
  } finally {
    await nightmareInstance.end();
  }
  logger.info(`intiateESIGNProcess Ended.`);
}

const schedulerFunc = async () => {
  logger.debug(`schedulerFunc Invoked: Current Delay Interval is ${getDelayIntervalInMinutes()} minutes`);
  await intiateESIGNProcess();
  logger.info(`Next Esign submission is scheduled after ${getDelayIntervalInMinutes()} minutes`);
  setTimeout(schedulerFunc, getDelayIntervalInMinutes() * 60);
};

async function parseAndValidateCLIFlags() {
  program.version("1.0.0");
  program
    .option("-a, --aadhaar <12 digits Aadhaar Number>", "Your Aadhaar Number")
    .option("-u, --uan <12 digits UAN Number>", "Your UAN Number")
    .option("-p, --password <Password>", "Your password for EPF website")
    .option("-b, --show-browser", "Use this flag if you want to disable headless mode", false)
    .option("-s, --silent", "Use this flag to run in silent mode, without notifications", false);
  program.parse(process.argv);
  cliOptions = program.opts();

  ["uan", "password", "aadhaar"].forEach((field) => {
    if (cliOptions[field] && cliOptions[field].validateField(field.toUpperCase())) {
      eval(`${field.toUpperCase()}="${cliOptions[field]}"`);
    }
  });
  if (!UAN || !PASSWORD || !AADHAAR) await promptForUserDetails();
}

async function main() {
  await parseAndValidateCLIFlags();
  await schedulerFunc();
}

main();
