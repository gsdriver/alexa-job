//
// Utility functions
//

'use strict';

const roulette = require('./roulette');
const blackjack = require('./blackjack');
const slotmachine = require('./slotmachine');
const videopoker = require('./videopoker');
const craps = require('./craps');
const utils = require('./utils');
const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.accessKeyId,
  secretAccessKey: process.env.secretAccessKey,
  region: 'us-east-1',
});
const SES = new AWS.SES();

function sendEmail(text, callback) {
  const d = new Date();
  d.setHours(d.getHours() - 7);

  const digestName = (d.getHours() < 12)
          ? 'Alexa Skill Usage Morning Digest'
          : 'Alexa Skill Usage Evening Digest';

  const params = {
    Destination: {
      ToAddresses: [
        process.env.MAILTO,
      ],
    },
    Message: {
      Body: {
        Text: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
      Subject: {
        Data: digestName,
        Charset: 'UTF-8',
      },
    },
    Source: process.env.MAILFROM,
  };

  SES.sendEmail(params, callback);
}

function getMailText(callback) {
  let toRun = 5;
  let bjText;
  let slotText;
  let rouletteText;
  let pokerText;
  let crapsText;

  blackjack.getBlackjackMail((text) => {
    bjText = text;
    completed();
  });

  slotmachine.getSlotsMail((text) => {
    slotText = text;
    completed();
  });

  roulette.getRouletteMail((text) => {
    rouletteText = text;
    completed();
  });

  videopoker.getPokerMail((text) => {
    pokerText = text;
    completed();
  });

  craps.getCrapsMail((text) => {
    crapsText = text;
    completed();
  });

  function completed() {
    toRun--;
    if (toRun === 0) {
      const mailBody = 'BLACKJACK\r\n' + bjText + '\r\n\r\nROULETTE\r\n' + rouletteText + '\r\n\r\nSLOTS\r\n' + slotText + '\r\n\r\nVIDEO POKER\r\n' + pokerText + '\r\n\r\nCRAPS\r\n' + crapsText;
      callback(mailBody);
    }
  }
}

if (process.env.RUNLOOP) {
  let mailSent;
  let closedRouletteTournament;
  let closedBlackjackTournament;
  let loggedNewUsers;

  // Get the ranks every 5 minutes and write to S3 if successful
  setInterval(() => {
    // Write to S3
    roulette.updateRouletteScores();
    slotmachine.updateSlotMachineScores();
    blackjack.updateBlackjackScores();
    videopoker.updatePokerScores();
    craps.updateCrapsScores();

    // Send mail around 5 AM and 5 PM
    const d = new Date();
    d.setHours(d.getHours() - 7);

    if ((d.getHours() % 12) == 5) {
      if (!mailSent) {
        // First time in this hour!
        mailSent = true;
        getMailText((mailBody) => {
          sendEmail(mailBody, (err, data) => {
            if (err) {
              console.log('Error sending mail ' + err);
            } else {
              console.log('Mail sent!');
            }
          });
        });
      }
    } else {
      // Not 5:00 hour anymore, so reset mailSent
      mailSent = false;
    }

    // Close the roulette tournament down on Fridays after 1 AM
    if ((d.getDay() == 5) && (d.getHours() == 1)) {
      if (!closedRouletteTournament) {
        // First time in this hour!
        closedRouletteTournament = true;
        roulette.closeTournament((err) => {
          if (err) {
            console.log('Closing error: ' + err);
          } else {
            console.log('Closed tournament!');
          }
        });
      }
    } else {
      // Not Friday at 1:00, so reset flag
      closedRouletteTournament = false;
    }

    // Close the blackjack tournament down on Wednesdays after 1 AM
    if ((d.getDay() == 3) && (d.getHours() == 1)) {
      if (!closedBlackjackTournament) {
        // First time in this hour!
        closedBlackjackTournament = true;
        blackjack.closeTournament((err) => {
          if (err) {
            console.log('Closing error: ' + err);
          } else {
            console.log('Closed tournament!');
          }
        });
      }
    } else {
      // Not Wednesday at 1:00, so reset flag
      closedBlackjackTournament = false;
    }

    // And save the number of new users every day at midnight
    if ((d.getHours() % 24) == 0) {
      if (!loggedNewUsers) {
        loggedNewUsers = true;
        utils.saveNewUsers();
      }
    } else {
      // Past midnight hour, so reset flag
      loggedNewUsers = false;
    }
  }, 1000*60*5);
}

if (process.env.SINGLERUN) {
  getMailText((mailBody) => {
    console.log(mailBody);
  });
}

if (process.env.CLOSETOURNAMENT) {
  roulette.closeTournament((err) => {
    if (err) {
      console.log('Closing error: ' + err);
    } else {
      console.log('Closed tournament!');
    }
  });
}
