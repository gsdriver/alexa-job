'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

let text = 'Total,Hard,Pair,First Two,Dealer Card,Suggestion,Follow,Deviate,Hit,Stand,Split,Double,Surrender\r\n';

processDBEntries('Blackjack_Analysis',
  (hand) => {
    const cards = hand.cards.split('-');
    let play;
    let line;
    let total = 0;
    const followed = hand[hand.suggestion] ? hand[hand.suggestion] : 0;

    // Only process the new format - five entries
    if (cards.length === 5) {
      for (play in hand) {
        if ((play !== 'cards') && (play !== 'suggestion')) {
          total += hand[play];
        }
      }

      line = cards[1] + ',' + (cards[0] == 'H' ? 'Hard' : 'Soft');
      line += ',' + cards[3];
      line += ',' + cards[2];
      line += ',' + cards[4];
      line += ',' + hand.suggestion;
      line += ',' + followed;
      line += ',' + (total - followed);
      line += ',' + (hand.hit ? hand.hit : 0);
      line += ',' + (hand.stand ? hand.stand : 0);
      line += ',' + (hand.split ? hand.split : 0);
      line += ',' + (hand.double ? hand.double : 0);
      line += ',' + (hand.surrender ? hand.surrender : 0);
      line += '\r\n';
      text += line;
    }
  },
  (err, results) => {
  if (err) {
    callback('Error processing data: ' + err);
  } else {
    writeResults(text);
  }
});

function writeResults(text) {
  const csvFile = 'blackjack-hands.csv';

  // Delete the csv file if it exists
  if (fs.existsSync(csvFile)) {
    fs.unlinkSync(csvFile);
  }

  fs.writeFile(csvFile, text, (err) => {
    if (err) {
      console.log(err);
    }
  });
}

function processDBEntries(dbName, callback, complete) {
  const results = [];

  // Loop thru to read in all items from the DB
  (function loop(firstRun, startKey) {
   const params = {TableName: dbName};

   if (firstRun || startKey) {
     params.ExclusiveStartKey = startKey;

     const scanPromise = doc.scan(params).promise();
     return scanPromise.then((data) => {
       let i;

       for (i = 0; i < data.Items.length; i++) {
         const entry = callback(data.Items[i]);
         if (entry) {
           results.push(entry);
         }
       }

       if (data.LastEvaluatedKey) {
         return loop(false, data.LastEvaluatedKey);
       }
     });
   }
  })(true, null).then(() => {
    complete(null, results);
  }).catch((err) => {
    console.log(err.stack);
    complete(err);
  });
}
