//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
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
        }

        text = 'There are ' + results.length + ' registered players: ';
        text += (players['en-US'] ? players['en-US'] : 'no') + ' American, ';
        text += (players['en-GB'] ? players['en-GB'] : 'no') + ' English, ';
        text += 'and ' + (players['de-DE'] ? players['de-DE'] : 'no') + ' German.\r\n';
        text += ('There have been a total of ' + totalRounds + ' rounds played.\r\n');
        text += multiplePlays + ' people have played more than one round. ' + maxRounds + ' is the most rounds played by one person.\r\n';
        text += (ads + ' people have heard your old-format ad.\r\n');
        text += utils.getAdText(newads);
      }

      callback(text);
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
