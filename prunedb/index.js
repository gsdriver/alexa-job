//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.accessKeyId,
  secretAccessKey: process.env.secretAccessKey,
  region: 'us-east-1',
});
const SES = new AWS.SES();
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

// If you last played more than 180 days ago, you're gone!
const RETENTION = 180*24*60*60*1000;

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('Prune DB triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  getMailText((mailBody) => {
    sendEmail(mailBody, (err, data) => {
      if (err) {
        console.log('Error sending mail ' + err.stack);
        callback(err);
      } else {
        console.log('Mail sent!');
      }
    });
  });
};

function getMailText(callback) {
  let toRun = 5;
  const summary = {};

  pruneRecords('PlayBlackjack', summary, (err) => {
    completed();
  });
  pruneRecords('RouletteWheel', summary, (err) => {
    completed();
  });
  pruneRecords('Slots', summary, (err) => {
    completed();
  });
  pruneRecords('VideoPoker', summary, (err) => {
    completed();
  });
  pruneRecords('Craps', summary, (err) => {
    completed();
  });

  function completed() {
    toRun--;
    if (toRun === 0) {
      let mailBody = '<HTML>';
      let field;

      for (field in summary) {
        if (field && summary[field]) {
          mailBody += summary[field];
        }
      }

      mailBody += '</HTML>';
      callback(mailBody);
    }
  }
}

function pruneRecords(dbName, summary, callback) {
  let text;
  const oldPlayers = [];
  let newPlayers = 0;
  const now = Date.now();

  processDBEntries(dbName,
    (item) => {
      let game;
      let newestTimestamp;

      for (game in item.mapAttr) {
        if (game && item.mapAttr[game] && item.mapAttr[game].timestamp) {
          if (!newestTimestamp) {
            newestTimestamp = item.mapAttr[game].timestamp;
          } else if (item.mapAttr[game].timestamp > newestTimestamp) {
            newestTimestamp = item.mapAttr[game].timestamp;
          }
        }
      }

      if (newestTimestamp && ((now - newestTimestamp) > RETENTION)) {
        // This one is old
        oldPlayers.push(item.userId);
      } else {
        newPlayers++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting ' + dbName + ' data: ' + err);
    } else {
      // Go through and delete these users
      let numItems = oldPlayers.length;

      oldPlayers.forEach((player) => {
        doc.delete({TableName: dbName, Key: {userId: player}}, (err, data) => {
          if (--numItems == 0) {
            done();
          }
        });
      });

      function done() {
        // And give a summary
        text = dbName + ': deleted ' + oldPlayers.length + ' players, leaving ' + newPlayers + '.\n';
        summary[dbName] = text;
        callback(text);
      }
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

function sendEmail(text, callback) {
  const digestName = 'Prune database report';

  const params = {
    Destination: {
      ToAddresses: [
        process.env.MAILTO,
      ],
    },
    Message: {
      Body: {
        Html: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
      Subject: {
        Data: digestName,
        Charset: 'UTF-8',
      },
    },
    Source: process.env.MAILFROM,
  };

  SES.sendEmail(params, callback);
}
