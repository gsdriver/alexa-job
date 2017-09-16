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
  saveNewUsers: function() {
    const now = Date.now();
    const details = {roulette: 0, blackjack: 0, slots: 0, poker: 0, craps: 0, timestamp: now};

    // Read from the databases
    dynamodb.getItem({TableName: 'RouletteWheel', Key: {userId: {S: 'game'}}},
            (err, data) => {
      if (data && data.Item && data.Item.newUsers) {
        details.roulette = parseInt(data.Item.newUsers.N);
        dynamodb.getItem({TableName: 'PlayBlackjack', Key: {userId: {S: 'game'}}},
                (err, data) => {
          if (data && data.Item && data.Item.newUsers) {
            details.blackjack = parseInt(data.Item.newUsers.N);
            dynamodb.getItem({TableName: 'Slots', Key: {userId: {S: 'game'}}},
                    (err, data) => {
              if (data && data.Item && data.Item.newUsers) {
                details.slots = parseInt(data.Item.newUsers.N);
                dynamodb.getItem({TableName: 'VideoPoker', Key: {userId: {S: 'game'}}},
                        (err, data) => {
                  if (data && data.Item && data.Item.newUsers) {
                    details.poker = parseInt(data.Item.newUsers.N);
                    dynamodb.getItem({TableName: 'Craps', Key: {userId: {S: 'game'}}},
                            (err, data) => {
                      if (data && data.Item && data.Item.newUsers) {
                        details.craps = parseInt(data.Item.newUsers.N);

                        // Now write to S3
                        const params = {Body: JSON.stringify(details),
                          Bucket: 'garrett-alexa-usage',
                          Key: 'newusers/' + now + '.txt'};

                        s3.putObject(params, (err, data) => {});

                        // And reset the DBs
                        dynamodb.putItem({TableName: 'RouletteWheel',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'PlayBlackjack',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'Slots',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'VideoPoker',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'Craps',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  },
};
