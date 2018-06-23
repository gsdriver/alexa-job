'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

const prompts = {};
let numCalls = 1;
const suggestions = [];

processDBEntries('PlayBlackjack',
  (attributes) => {
    if (attributes.prompts) {
      let prompt;
      for (prompt in attributes.prompts) {
        prompts[prompt] = (prompts[prompt] + 1) || 1;
      }
    }
    if (attributes.tookSuggestion) {
      suggestions.push(attributes.tookSuggestion);
    }
  },
  (err, results) => {
    if (--numCalls === 0) {
      completed();
    }
});

function completed() {
  console.log('Blackjack prompts: ' + JSON.stringify(prompts));

  const csvFile = 'tookSuggestion.csv';
  let text = '';

  suggestions.forEach((suggestion) => {
    text += (suggestion.yes ? suggestion.yes : 0) + ',' + (suggestion.no ? suggestion.no : 0) + '\n';
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
           const entry = callback(data.Items[i].mapAttr);
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
