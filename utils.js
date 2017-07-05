//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

module.exports = {
  getAdSummary: function(data, adsPlayed) {
    let i;

    for (i = 0; i < data.Items.length; i++) {
      // Any ads played?
      if (data.Items[i].mapAttr && data.Items[i].mapAttr.M
              && data.Items[i].mapAttr.M.adsPlayed
              && data.Items[i].mapAttr.M.adsPlayed.M) {
        const ads = data.Items[i].mapAttr.M.adsPlayed.M;
        let ad;

        for (ad in ads) {
          if (adsPlayed[ad]) {
            adsPlayed[ad]++;
          } else {
            adsPlayed[ad] = 1;
          }
        }
      }
    }
  },
  getAdText: function(adsPlayed) {
    let text = '';

    if (adsPlayed) {
      let ad;

      text += 'Ads played - \r\n';
      for (ad in adsPlayed) {
        if (ad) {
          text += ('  ' + ad + ': ' + adsPlayed[ad] + '\r\n');
        }
      }
    }

    return text;
  },
  saveNewUsers: function(db, skill) {
    // Read from Dynamodb
    dynamodb.getItem({TableName: db, Key: {userId: {S: 'game'}}},
            (err, data) => {
      if (err || (data.Item === undefined)) {
        console.log(err);
      } else if (data.Item.newUsers) {
        // OK, write this value to S3
        const details = {newUsers: parseInt(data.Item.newUsers.N)};
        const params = {Body: JSON.stringify(details),
          Bucket: 'garrett-alexa-usage',
          Key: 'newusers/' + skill + '/' + Date.now() + '.txt'};

        s3.putObject(params, (err, data) => {
          // Don't care about the error
          if (err) {
            console.log(err, err.stack);
          }

          // Write to the DB, and reset the coins played to 0
          dynamodb.putItem({TableName: db,
              Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
              (err, data) => {
            // We don't take a callback, but if there's an error log it
            if (err) {
              console.log(err);
            }
          });
        });
      } else {
        console.log('No newUsers field in DB');
      }
    });
  },
};
