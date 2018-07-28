//
// Lambda function to backup dynamodb tables
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('DB Backups triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  const dbNames = ['RouletteWheel', 'PlayBlackjack', 'Slots', 'VideoPoker',
      'BlackjackParty', 'Craps', 'CasinoWar', 'Baccarat2'];
  let numCalls = dbNames.length;
  const now = getFormattedDate(new Date());

  dbNames.forEach((db) => {
    const params = {
      TableName: db,
      BackupName: db + '-' + now,
    };

    dynamodb.createBackup(params, (err, data) => {
      if (err) {
        console.log('Error: ' + err);
      }
      if (--numCalls === 0) {
        complete();
      }
    });
  });

  function complete() {
    console.log('Backups created!');
    callback();
  }
};

function getFormattedDate(date) {
  const year = date.getFullYear();
  let month = (1 + date.getMonth()).toString();
  let day = date.getDate().toString();

  if (month.length < 2) {
    month = '0' + month;
  }
  if (day.length < 2) {
    day = '0' + day;
  }
  return year + '-' + month + '-' + day;
}
