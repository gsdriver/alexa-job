'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

if ((process.argv.length === 2) || (process.argv[2] === 'list')) {
  listNames(() => {
    console.log('done');
  });
} else if ((process.argv.length === 5) && (process.argv[2] === 'change')) {
  changeNames(process.argv[3], process.argv[4], () => {
    console.log('done');
  });
}

function listNames(callback) {
  processDBEntries('ThreeCardHands',
    (err, results) => {
    if (err) {
      console.log('Error processing data: ' + err);
    } else {
      const names = {};
      const timedNames = {};

      results.forEach((result) => {
        result.hands.forEach((hand) => {
          names[hand.name] = (names[hand.name] + 1) || 1;
          if (hand.timestamp) {
            timedNames[hand.name] = (timedNames[hand.name] + 1) || 1;
          }
        });
      });

      console.log('WITH TIMESTAMPS:');
      console.log(timedNames);
      console.log('\nALL:');
      console.log(names);
    }
    callback();
  });
}

function changeNames(oldName, newName, callback) {
  processDBEntries('ThreeCardHands',
    (err, results) => {
    if (err) {
      console.log('Error processing data: ' + err);
      callback();
    } else {
      let change;
      let i;
      let numChanges = 0;

      results.forEach((result) => {
        change = false;
        for (i = 0; i < result.hands.length; i++) {
          if (result.hands[i].name === oldName) {
            result.hands[i].name = newName;
            change = true;
          }
        }

        if (change) {
          // Write out a new DB entry
          numChanges++;
          const Item = {token: result.token, hands: result.hands};
          doc.put({TableName: 'ThreeCardHands', Item: Item}, (err, data) => {
            if (err) {
              console.log('Error');
            }
            if (--numChanges === 0) {
              done();
            }
          });
        }
      });

      function done() {
        callback();
      }
    }
  });
}

function processDBEntries(dbName, complete) {
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
         const entry = data.Items[i];
         results.push(entry);
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
