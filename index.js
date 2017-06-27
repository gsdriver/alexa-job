//
// Utility functions
//

'use strict';

const roulette = require('./roulette');
const blackjack = require('./blackjack');
const slotmachine = require('./slotmachine');
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

if (process.env.RUNLOOP) {
  let mailSent;
  let closedTournament;

  // Get the ranks every 5 minutes and write to S3 if successful
  setInterval(() => {
    // Write to S3
    roulette.updateRouletteScores();
    slotmachine.updateSlotMachineScores();

    // Send mail around 5 AM and 5 PM
    const d = new Date();
    d.setHours(d.getHours() - 7);

    if ((d.getHours() % 12) == 5) {
      if (!mailSent) {
        // First time in this hour!
        mailSent = true;
        blackjack.getBlackjackMail((bjText) => {
          slotmachine.getSlotsMail((slotText) => {
            roulette.getRouletteMail((rouletteText) => {
              const mailBody = 'BLACKJACK\r\n' + bjText + '\r\n\r\nROULETTE\r\n' + rouletteText + '\r\n\r\nSLOTS\r\n' + slotText;

              console.log(mailBody);
              sendEmail(mailBody, (err, data) => {
                if (err) {
                  console.log('Error sending mail ' + err);
                } else {
                  console.log('Mail sent!');
                }
              });
            });
          });
        });
      }
    } else {
      // Not 5:00 hour anymore, so reset mailSent
      mailSent = false;
    }

    // And close the tournament down on Fridays after 1 AM
    if ((d.getDay() == 5) && (d.getHours() == 1)) {
      if (!closedTournament) {
        // First time in this hour!
        closedTournament = true;
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
      closedTournament = false;
    }
  }, 1000*60*5);
}

if (process.env.SINGLERUN) {
  blackjack.getBlackjackMail((bjText) => {
    slotmachine.getSlotsMail((slotText) => {
      roulette.getRouletteMail((rouletteText) => {
        const mailBody = 'BLACKJACK\r\n' + bjText + '\r\n\r\nROULETTE\r\n' + rouletteText + '\r\n\r\nSLOTS\r\n' + slotText;

        console.log(mailBody);
      });
    });
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
