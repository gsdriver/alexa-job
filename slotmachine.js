//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const utils = require('./utils');

module.exports = {
  // Generates the text for blackjack e-mail summary
  getSlotsMail: function(callback) {
    let text;

    getEntriesFromDB((err, results, newads) => {
      if (err) {
        text = 'Error getting slotmachine data: ' + err;
      } else {
        let totalSpins = 0;
        let maxSpins = 0;
        let i;

        for (i = 0; i < results.length; i++) {
          totalSpins += results[i].spins;
          if (results[i].spins > maxSpins) {
            maxSpins = results[i].spins;
          }
        }

        text = 'There are ' + results.length + ' registered players: ';
        text += ('There have been a total of ' + totalSpins + ' spins.\r\n');
        text += maxSpins + ' is the most spins played by one person.\r\n';
        text += utils.getAdText(newads);
      }

      callback(text);
    });
  },
  updateSlotMachineScores: function() {
    getEntriesFromDB((err, results, newads) => {
      if (!err) {
        const scoreData = {timestamp: Date.now()};

        const scores = [];

        results.forEach((score) => {
          if (score.high) {
            scores.push(score.high);
          }
        });
        scores.sort((a, b) => (b - a));
        scoreData.scores = scores;

        // Let's only write to S3 if these scores have changed
        checkScoreChange(scoreData, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'SlotMachineScores.txt'};

            s3.putObject(params, (err, data) => {
              if (err) {
                console.log(err, err.stack);
              }
            });
          }
        });
      }
    });
  },
};

// Function to get all the entries from the Database
function getEntriesFromDB(callback) {
  const results = [];
  const newads = [];

  // Loop thru to read in all items from the DB
  (function loop(firstRun, startKey) {
   const params = {TableName: 'Slots'};

   if (firstRun || startKey) {
     params.ExclusiveStartKey = startKey;

     const scanPromise = dynamodb.scan(params).promise();
     return scanPromise.then((data) => {
       let i;

       utils.getAdSummary(data, newads);
       for (i = 0; i < data.Items.length; i++) {
         if (data.Items[i].mapAttr && data.Items[i].mapAttr.M
          && data.Items[i].mapAttr.M.basic && data.Items[i].mapAttr.M.basic.M) {
           const entry = {};

           if (data.Items[i].mapAttr.M.basic.M.spins) {
             const spins = parseInt(data.Items[i].mapAttr.M.basic.M.spins.N);

             entry.spins = isNaN(spins) ? 0 : spins;
             if (data.Items[i].mapAttr.M.basic.M.high) {
               const high = parseInt(data.Items[i].mapAttr.M.basic.M.high.N);

               entry.high = isNaN(high) ? 0 : high;
             }
           } else {
             entry.spins = 0;
           }

           results.push(entry);
         }
       }

       if (data.LastEvaluatedKey) {
         return loop(false, data.LastEvaluatedKey);
       }
     });
   }
  })(true, null).then(() => {
    callback(null, results, newads);
  }).catch((err) => {
    callback(err, null), null;
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'SlotMachineScores.txt'}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback('error');
    } else {
      // Get the scores array from the file
      const scores = JSON.parse(data.Body.toString('ascii'));
      const oldLength = (scores && scores.scores) ? scores.scores.length : 0;
      const newLength = (newScores && newScores.scores) ? newScores.scores.length : 0;

      if (oldLength != newLength) {
        // They are different
        callback('different');
      } else {
        // Check if all alements are the same
        let i = 0;

        for (i = 0; i < newLength; i++) {
          if (scores.scores[i] != newScores.scores[i]) {
            callback('different');
            return;
          }
        }

        // If we made it this far, we are the same
        callback('same');
      }
    }
  });
}
