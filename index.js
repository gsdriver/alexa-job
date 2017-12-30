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

// 7 hours during DST, 8 hours outside of DST
const tzOffset = 8;

function sendEmail(text, callback) {
  const d = new Date();
  d.setHours(d.getHours() - tzOffset);

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
        Html: {
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
      const mailBody = '<HTML>' + bjText + rouletteText + slotText + pokerText + crapsText + '</HTML>';
      callback(mailBody);
    }
  }
}

if (process.env.RUNLOOP) {
  let mailSent;
  let closedRouletteTournament;
  let closedBlackjackTournament;
  let rebuiltLeaderBoards;
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
    d.setHours(d.getHours() - tzOffset);

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

    // Repopulate leaderboards on Sundays after 1 AM
    if ((d.getDay() == 0) && (d.getHours() == 1)) {
      if (!rebuiltLeaderBoards) {
        // First time in this hour!
        rebuiltLeaderBoards = true;
        utils.populateLeaderBoardFromDB('slots', (err) => {
          if (err) {
            console.log('Slots leaderboard rebuild error: ' + err);
          } else {
            console.log('Rebuilt Slots Leaderboard');
          }
        });
        utils.populateLeaderBoardFromDB('roulette', (err) => {
          if (err) {
            console.log('Roulette leaderboard rebuild error: ' + err);
          } else {
            console.log('Rebuilt Roulette Leaderboard');
          }
        });
        utils.populateLeaderBoardFromDB('blackjack', (err) => {
          if (err) {
            console.log('Blackjack leaderboard rebuild error: ' + err);
          } else {
            console.log('Rebuilt Blackjack Leaderboard');
          }
        });
        utils.populateLeaderBoardFromDB('craps', (err) => {
          if (err) {
            console.log('Craps leaderboard rebuild error: ' + err);
          } else {
            console.log('Rebuilt Craps Leaderboard');
          }
        });
        utils.populateLeaderBoardFromDB('videopoker', (err) => {
          if (err) {
            console.log('Videopoker leaderboard rebuild error: ' + err);
          } else {
            console.log('Rebuilt Videopoker Leaderboard');
          }
        });
      }
    } else {
      // Not Sunday at 1:00, so reset flag
      rebuiltLeaderBoards = false;
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
