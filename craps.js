//
// Craps functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const utils = require('./utils');

module.exports = {
  // Generates the text for craps e-mail summary
  getCrapsMail: function(callback) {
    let text;

    getEntriesFromDB((err, results, newads) => {
      if (err) {
        callback('Error getting craps data: ' + err);
      } else {
        let i;
        let basicRecent = 0;
        let numRounds = 0;
        const now = Date.now();
        const registered = [];

        for (i = 0; i < results.length; i++) {
          if (results[i].basic) {
            const basic = results[i].basic;
            if (basic.timestamp &&
              ((now - basic.timestamp) < 24*60*60*1000)) {
              basicRecent++;
            }
            if (basic.rounds) {
              numRounds += basic.rounds;
            }
          }

          if (results[i].firstName) {
            registered.push(results[i].firstName);
          }
        }

        let registeredText = '';
        if (registered.length) {
          registeredText = 'The following individuals have registered: ' + speechUtils.and(registered) + '\r\n';
        }

        text = 'Of ' + results.length + ' registered players ';
        text += basicRecent + ' have played in the past 24 hours. ';
        text += 'There have been a total of ' + numRounds + ' rounds played. ';
        text += registeredText;
        text += utils.getAdText(newads);
        callback(text);
      }
    });
  },
  updateCrapsScores: function() {
    getEntriesFromDB((err, results, newads) => {
      if (!err) {
        const scoreData = {timestamp: Date.now()};
        // Only support basic for now
        const scores = {basic: []};
        let i;

        for (i = 0; i < results.length; i++) {
          if (results[i].basic && results[i].basic.bankroll) {
            scores.basic.push({name: results[i].firstName,
                bankroll: results[i].basic.bankroll});
          }
        }

        scores.basic.sort((a, b) => (b.bankroll - a.bankroll));
        scoreData.scores = scores;

        // Only write bankroll to S3 if it has changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'CrapsScores.txt'};

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
   const params = {TableName: 'Craps'};

   if (firstRun || startKey) {
     params.ExclusiveStartKey = startKey;

     const scanPromise = doc.scan(params).promise();
     return scanPromise.then((data) => {
       let i;

       utils.getAdSummary(data, newads);
       for (i = 0; i < data.Items.length; i++) {
         if (data.Items[i].mapAttr) {
           const entry = {};

           if (data.Items[i].mapAttr.numRounds) {
             entry.numRounds = parseInt(data.Items[i].mapAttr.numRounds);
           }
           entry.firstName = data.Items[i].mapAttr.firstName;
           entry.facebookID = data.Items[i].mapAttr.facebookID;
           entry.email = data.Items[i].mapAttr.email;
           entry.adplayed = (data.Items[i].mapAttr.adStamp != undefined);
           if (data.Items[i].mapAttr.basic) {
             const basicGame = data.Items[i].mapAttr.basic;

             entry.basic = {};
             entry.basic.rounds = basicGame.rounds;
             entry.basic.timestamp = basicGame.timestamp;

             // Only count bankroll if it looks like they played
             if (basicGame.bankroll) {
               if (entry.basic.rounds || (basicGame.bankroll !== 1000)) {
                 entry.basic.bankroll = basicGame.bankroll;
               }
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
    console.log(err.stack);
    callback(err, null, null);
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'CrapsScores.txt'}, (err, data) => {
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
              if ((scores[game][i].name != newScores[game][i].name)
                || (scores[game][i].bankroll != newScores[game][i].bankroll)) {
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
