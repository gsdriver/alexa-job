'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

const csvFile = 'tournamentPlayers.csv';
let text = 'Game,User,Tournaments Played\n';
getPlayers('Slots', (slotPlayers) => {
  getPlayers('PlayBlackjack', (blackjackPlayers) => {
    getPlayers('RouletteWheel', (roulettePlayers) => {
      slotPlayers.forEach((player) => {
        text += ('Slots,' + player.user + ',' + player.times + '\n');
      });
      blackjackPlayers.forEach((player) => {
        text += ('Blackjack,' + player.user + ',' + player.times + '\n');
      });
      roulettePlayers.forEach((player) => {
        text += ('Roulette,' + player.user + ',' + player.times + '\n');
      });
      if (fs.existsSync(csvFile)) {
        fs.unlinkSync(csvFile);
      }
      fs.writeFile(csvFile, text, (err) => {
        console.log('Done');
      });
    });
  });
});

function getPlayers(dbName, callback) {
  const players = [];

  processDBEntries(dbName,
    (item) => {
      const attributes = item.mapAttr;

      if (attributes && attributes.tournamentsPlayed) {
        players.push({user: item.userId, times: attributes.tournamentsPlayed});
      }
    },
    (err, results) => {
    if (err) {
      callback('Error processing data: ' + err);
    } else {
      callback(players);
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
