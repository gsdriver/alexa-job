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
  const details = {roulette: 0, blackjack: 0, slots: 0, poker: 0, craps: 0, timestamp: now};
  let numCalls = 5;

  // Read from the databases
  doc.get({TableName: 'RouletteWheel', Key: {userId: 'game'}},
          (err, data) => {
    if (data && data.Item && data.Item.newUsers) {
      details.roulette = parseInt(data.Item.newUsers);
    }
    if (--numCalls === 0) {
      completed();
    }
  });

  doc.get({TableName: 'PlayBlackjack', Key: {userId: 'game'}},
          (err, data) => {
    if (data && data.Item && data.Item.newUsers) {
      details.blackjack = parseInt(data.Item.newUsers);
    }
    if (--numCalls === 0) {
      completed();
    }
  });

  doc.get({TableName: 'Slots', Key: {userId: 'game'}},
          (err, data) => {
    if (data && data.Item && data.Item.newUsers) {
      details.slots = parseInt(data.Item.newUsers);
    }
    if (--numCalls === 0) {
      completed();
    }
  });

  doc.get({TableName: 'VideoPoker', Key: {userId: 'game'}},
          (err, data) => {
    if (data && data.Item && data.Item.newUsers) {
      details.poker = parseInt(data.Item.newUsers);
    }
    if (--numCalls === 0) {
      completed();
    }
  });

  doc.get({TableName: 'Craps', Key: {userId: 'game'}},
          (err, data) => {
    if (data && data.Item && data.Item.newUsers) {
      details.craps = parseInt(data.Item.newUsers);
    }
    if (--numCalls === 0) {
      completed();
    }
  });

  function completed() {
    // Now write to S3
    const params = {Body: JSON.stringify(details),
      Bucket: 'garrett-alexa-usage',
      Key: 'newusers/' + now + '.txt'};
    const Item = {userId: 'game', newUsers: 0};

    console.log(JSON.stringify(params));
    numCalls = 5;
    s3.putObject(params, (err, data) => {
      // And reset the DBs
      doc.put({TableName: 'RouletteWheel',
                    Item: Item},
                    (err, data) => {
        if (--numCalls === 0) {
          callback();
        }
      });
      doc.put({TableName: 'PlayBlackjack',
                    Item: Item},
                    (err, data) => {
        if (--numCalls === 0) {
          callback();
        }
      });
      doc.put({TableName: 'Slots',
                    Item: Item},
                    (err, data) => {
        if (--numCalls === 0) {
          callback();
        }
      });
      doc.put({TableName: 'VideoPoker',
                    Item: Item},
                    (err, data) => {
        if (--numCalls === 0) {
          callback();
        }
      });
      doc.put({TableName: 'Craps',
                    Item: Item},
                    (err, data) => {
        if (--numCalls === 0) {
          callback();
        }
      });
    });
  }
}
