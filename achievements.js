'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

let numCalls = 2;
let blackjackDays;
let rouletteDays;

const blackjackDaysPlayed = {};
processDBEntries('PlayBlackjack',
  (attributes) => {
    if (attributes.achievements && attributes.achievements.daysPlayed) {
      blackjackDaysPlayed[attributes.achievements.daysPlayed] =
          (blackjackDaysPlayed[attributes.achievements.daysPlayed] + 1) || 1;
    }
  },
  (err, results) => {
    blackjackDays = getPlayersPerDay(blackjackDaysPlayed);
    if (--numCalls === 0) {
      completed();
    }
});

const rouletteDaysPlayed = {};
processDBEntries('RouletteWheel',
  (attributes) => {
    if (attributes.achievements && attributes.achievements.daysPlayed) {
      rouletteDaysPlayed[attributes.achievements.daysPlayed] =
          (rouletteDaysPlayed[attributes.achievements.daysPlayed] + 1) || 1;
    }
  },
  (err, results) => {
    rouletteDays = getPlayersPerDay(rouletteDaysPlayed);
    if (--numCalls === 0) {
      completed();
    }
});

function completed() {
  console.log('blackjack');
  console.log('days,players');
  blackjackDays.forEach((result) => {
    console.log(result.days + ',' + result.players);
  });

  console.log('roulette');
  console.log('days,players');
  rouletteDays.forEach((result) => {
    console.log(result.days + ',' + result.players);
  });
}

function getPlayersPerDay(daysPlayed) {
  let day;
  const results = [];
  for (day in daysPlayed) {
    if (day) {
      results.push({days: day, players: daysPlayed[day]});
    }
  }
  results.sort((a, b) => (a.days - b.days));
  return results;
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
