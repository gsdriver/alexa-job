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
  getBlackjackMail: function(callback) {
    let text;

    getEntriesFromDB((err, results, newads) => {
      if (err) {
        text = 'Error getting blackjack data: ' + err;
      } else {
        let totalRounds = 0;
        let maxRounds = 0;
        let multiplePlays = 0;
        let i;
        const players = {};
        let ads = 0;
        let nonService = 0;
        let hands = 0;
        let high = 0;

        for (i = 0; i < results.length; i++) {
          if (players[results[i].locale]) {
            players[results[i].locale]++;
          } else {
            players[results[i].locale] = 1;
          }

          totalRounds += results[i].numRounds;
          if (results[i].numRounds > maxRounds) {
            maxRounds = results[i].numRounds;
          }
          if (results[i].numRounds > 1) {
            multiplePlays++;
          }

          if (results[i].adplayed) {
            ads++;
          }
          if (results[i].nonService) {
            nonService++;
          }
          if (results[i].hands) {
            hands += results[i].hands;
          }
          if (results[i].high && (results[i].high > high)) {
            high = results[i].high;
          }
        }

        text = 'There are ' + results.length + ' registered players with ' + nonService + ' off the service: ';
        text += (players['en-US'] ? players['en-US'] : 'no') + ' American, ';
        text += (players['en-GB'] ? players['en-GB'] : 'no') + ' English, ';
        text += 'and ' + (players['de-DE'] ? players['de-DE'] : 'no') + ' German.\r\n';
        text += ('There have been a total of ' + totalRounds + ' sessions played.\r\n');
        text += multiplePlays + ' people have played more than one round. ' + maxRounds + ' is the most rounds played by one person.\r\n';
        text += ('Since v5, there have been ' + hands + ' hands played. The high score is $' + high + '.\r\n');
        text += (ads + ' people have heard your old-format ad.\r\n');
        text += utils.getAdText(newads);
      }

      callback(text);
    });
  },
  updateBlackjackScores: function() {
    getEntriesFromDB((err, results, newads) => {
      if (!err) {
        const scoreData = {timestamp: Date.now()};
        // Only support standard for now
        const scores = {standard: []};
        let i;

        for (i = 0; i < results.length; i++) {
          if (results[i].high) {
            scores.standard.push(results[i].high);
          }
        }

        scores.standard.sort((a, b) => (b - a));
        scoreData.scores = scores;

        // Only write high scores to S3 if they have changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'BlackjackScores.txt'};

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
   const params = {TableName: 'PlayBlackjack'};

   if (firstRun || startKey) {
     params.ExclusiveStartKey = startKey;

     const scanPromise = dynamodb.scan(params).promise();
     return scanPromise.then((data) => {
       let i;

       utils.getAdSummary(data, newads);
       for (i = 0; i < data.Items.length; i++) {
         if (data.Items[i].mapAttr && data.Items[i].mapAttr.M) {
           const entry = {};

           entry.numRounds = parseInt(data.Items[i].mapAttr.M.numRounds.N);
           entry.locale = data.Items[i].mapAttr.M.playerLocale.S;
           entry.adplayed = (data.Items[i].mapAttr.M.adStamp != undefined);
           if (data.Items[i].mapAttr.M.standard && data.Items[i].mapAttr.M.standard.M) {
             const standardGame = data.Items[i].mapAttr.M.standard.M;

             entry.nonService = true;
             if (standardGame.hands && standardGame.hands.N) {
               entry.hands = parseInt(standardGame.hands.N);
             }
             if (standardGame.high && standardGame.high.N) {
               entry.high = parseInt(standardGame.high.N);
             }
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
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'BlackjackScores.txt'}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback('error');
    } else {
      // Get the scores array from the file
      const currentScoreData = JSON.parse(data.Body.toString('ascii'));
      let game;
      let oldLength;
      let newLength;
      const scores = (currentScoreData) ? (currentScoreData.scores) : undefined;

      for (game in newScores) {
        if (game) {
          if (!scores || !scores[game]) {
            callback('different');
            return;
          }

          oldLength = (scores[game]) ? scores[game].length : 0;
          newLength = (newScores[game]) ? newScores[game].length : 0;

          if (oldLength != newLength) {
            // They are different
            callback('different');
            return;
          } else {
            // Check if all alements are the same
            let i = 0;

            for (i = 0; i < newLength; i++) {
              if (scores[game][i] != newScores[game][i]) {
                callback('different');
                return;
              }
            }
          }
        }
      }

      // If we made it this far, we are the same
      callback('same');
    }
  });
}
