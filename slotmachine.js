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
