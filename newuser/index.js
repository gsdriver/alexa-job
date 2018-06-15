//
// Logs new users
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('New users triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  saveNewUsers(() => {
    console.log('New users saved!');
    callback();
  });
};

function saveNewUsers(callback) {
  const now = Date.now();
  const details = {timestamp: now};
  let numCalls = 0;
  const dbs = {
    roulette: 'RouletteWheel',
    blackjack: 'PlayBlackjack',
    slots: 'Slots',
    poker: 'VideoPoker',
    craps: 'Craps',
    war: 'War',
    baccarat: 'Baccarat',
  };

  let db;
  for (db in dbs) {
    if (dbs[db]) {
      // Read from the databases
      numCalls++;
      doc.get({TableName: dbs[db], Key: {userId: 'game'}},
              (err, data) => {
        if (data && data.Item && data.Item.newUsers) {
          details[db] = parseInt(data.Item.newUsers);
        } else {
          details[db] = 0;
        }
        if (--numCalls === 0) {
          completed();
        }
      });
    }
  }

  function completed() {
    // Now write to S3
    const params = {Body: JSON.stringify(details),
      Bucket: 'garrett-alexa-usage',
      Key: 'newusers/' + now + '.txt'};
    const Item = {userId: 'game', newUsers: 0};

    console.log(JSON.stringify(params));
    numCalls = 0;
    s3.putObject(params, (err, data) => {
      // And reset the DBs
      for (db in dbs) {
        if (dbs[db]) {
          numCalls++;
          doc.put({TableName: dbs[db],
                        Item: Item},
                        (err, data) => {
            if (--numCalls === 0) {
              callback();
            }
          });
        }
      }
    });
  }
}
