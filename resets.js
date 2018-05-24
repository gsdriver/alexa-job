'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

let numCalls = 1;
const resets = [];

processDBEntries('RouletteWheel',
  (item) => {
    const attributes = item.mapAttr;
    let text;

    if (attributes.american && attributes.american.legacySpins && attributes.american.spins) {
      // It is valid to count spins and resets
      text = item.userId + ',american,' + attributes.american.spins + ','
        + (attributes.american.resets ? attributes.american.resets : 0);
      resets.push(text);
    }
    if (attributes.european && attributes.european.legacySpins && attributes.european.spins) {
      text = item.userId + ',european,' + attributes.european.spins + ','
        + (attributes.european.resets ? attributes.european.resets : 0);
      resets.push(text);
    }
  },
  (err, results) => {
    if (--numCalls === 0) {
      completed();
    }
});

function completed() {
  const csvFile = 'resets.csv';
  let text = '';

  text += 'userId,wheel,spins,resets\n';
  resets.forEach((line) => {
    text += line + '\n';
  });

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
         if (data.Items[i].mapAttr) {
           const entry = callback(data.Items[i]);
           if (entry) {
             results.push(entry);
           }
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
