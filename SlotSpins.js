'use strict';

const fs = require('fs');
const AWS = require('aws-sdk');
AWS.config.update({
  region: 'us-east-1',
});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

const csvFile = 'SlotPlayers.csv';
let text = 'User,locale,basic,wild,progressive,loose,crazydiamond,holiday\n';
getPlayers('Slots', (slotPlayers) => {
  slotPlayers.forEach((player) => {
    text += (player.user + ',' + player.locale + ',' + player.spins.basic + ',' + player.spins.wild + ',' + player.spins.progressive + ',' + player.spins.loose + ',' + player.spins.crazydiamond + ',' + player.spins.holiday + '\n');
  });
  if (fs.existsSync(csvFile)) {
    fs.unlinkSync(csvFile);
  }
  fs.writeFile(csvFile, text, (err) => {
    console.log('Done');
  });
});

function getPlayers(dbName, callback) {
  const players = [];

  processDBEntries(dbName,
    (item) => {
      const attributes = item.mapAttr;
      const spins = {basic: 0, wild: 0, progressive: 0, loose: 0, crazydiamond: 0, holiday: 0};
      let pushit = false;

      if (attributes) {
        let game;
        for (game in spins) {
          if (attributes[game] && attributes[game].spins) {
            spins[game] = attributes[game].spins;
            pushit = true;
          }
        }
        if (pushit) {
          players.push({user: item.userId, locale: attributes.playerLocale, spins: spins});
        }
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
