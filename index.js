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

if (process.env.SETS3) {
  // Get the ranks every 5 minutes and write to S3 if successful
  setInterval(() => {
    roulette.updateRouletteScores();
    slotmachine.updateSlotMachineScores();
  }, 1000*60*5);
}

if (process.env.SENDMAIL) {
  // Send a summary mail every 12 hours
  setInterval(() => {
    // Yes, this is the first run of the day, so let's send an e-mail summary
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
  }, 1000*60*60*12);
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
