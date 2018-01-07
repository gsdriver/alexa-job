'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

let numCalls = 1;
let blackjackPlayers;
const ACTIVE_THRESHOLD = 7*24*60*60*1000;

processDBEntries('PlayBlackjack', isActive, (err, players) => {
  blackjackPlayers = groupPlay(players);
  if (--numCalls === 0) {
    completed();
  }
});

function isActive(attributes) {
  let timestamp;
  const now = Date.now();

  if (attributes.standard && attributes.standard.timestamp
    && ((now - attributes.standard.timestamp) < ACTIVE_THRESHOLD)) {
    timestamp = attributes.standard.timestamp;
  }
  if (!timestamp && attributes.tournament && attributes.tournament.timestamp
    && ((now - attributes.tournament.timestamp) < ACTIVE_THRESHOLD)) {
    timestamp = attributes.tournament.timestamp;
  }

  if (timestamp) {
    // They are active!
    return {
      last: timestamp,
      first: getFirstPlayFromAds(attributes.adsPlayed),
    };
  }
}

function completed() {
  console.log('blackjack');
  console.log('Time since first play,Player Count');
  console.log('>120 days,' + blackjackPlayers['121']);
  console.log('61-120 days,' + blackjackPlayers['61']);
  console.log('31-60 days,' + blackjackPlayers['31']);
  console.log('8-30 days,' + blackjackPlayers['8']);
  console.log('In the last week,' + blackjackPlayers['lastweek']);
  console.log('No ad,' + blackjackPlayers['noad']);
}

function groupPlay(players) {
  const now = Date.now();
  const firstPlay = {'noad': 0, '121': 0, '61': 0, '31': 0, '8': 0, 'lastweek': 0};

  // Group first play into buckets
  // > 120 days
  // 61-120 days
  // 31-60 days
  // 8-30 days
  // Past 7 days
  players.forEach((player) => {
    if (player.first) {
      const diff = now - player.first;

      if (diff <= 7*24*60*60*1000) {
        firstPlay['lastweek']++;
      } else if (diff <= 30*24*60*60*1000) {
        firstPlay['8']++;
      } else if (diff <= 60*24*60*60*1000) {
        firstPlay['31']++;
      } else if (diff <= 120*24*60*60*1000) {
        firstPlay['61']++;
      } else {
        firstPlay['121']++;
      }
    } else {
      firstPlay['noad']++;
    }
  });

  return firstPlay;
}

function getFirstPlayFromAds(ads) {
  // First play is based on oldest ad played
  let firstPlay;

  if (ads) {
    let ad;

    for (ad in ads) {
      if (!firstPlay || (ads[ad] < firstPlay)) {
        firstPlay = ads[ad];
      }
    }
  }

  return firstPlay;
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
