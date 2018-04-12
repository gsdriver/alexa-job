'use strict';

const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
let stuck = 0;

processDBEntries('PlayBlackjack',
  (item) => {
    const attributes = item.mapAttr;

    if (attributes && attributes.standard && attributes.standard.possibleActions
      && (attributes.standard.possibleActions.indexOf('shuffle') > -1)) {
      stuck++;
      console.log(item.userId);
    }
  },
  (err, results) => {
  if (err) {
    callback('Error processing data: ' + err);
  } else {
    console.log(stuck + ' players were stuck in shuffle state.');
  }
});

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
