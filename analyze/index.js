//
// Processes completed hands and writes to Dynamo
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

const ANALYZEBUCKET = 'garrett-alexa-analysis';

exports.handler = function(event, context, callback) {
  const params = buildParams(event);

  if (params) {
    s3.getObject(params, (err, data) => {
      if (err) {
        console.log(err.stack);
        callback();
      } else {
        const game = JSON.parse(data.Body.toString());
        const firstRound = game.rounds[0];

        if (isDefaultRules(game)) {
          // OK, this isn't a custom set of rules - let's process
          firstRound.cards.sort((a, b) => (b - a));
          const key = firstRound.cards[0] + '-' + firstRound.cards[1] + '-' + game.dealerCard;

          // First write the suggestion for this combination
          doc.put({TableName: 'Blackjack_Analysis',
            Item: {cards: key, suggestion: firstRound.suggestion}},
            (err, data) => {
            if (err) {
              console.log(err.stack);
              callback();
            } else {
              // Now increment based on what this player did
              const params = {
                TableName: 'Blackjack_Analysis',
                Key: {cards: key},
              };

              params.AttributeUpdates = {};
              params.AttributeUpdates[firstRound.action] = {Action: 'ADD', Value: 1};
              doc.update(params, (err, data) => {
                if (err) {
                  console.log(err);
                }
                callback();
              });
            }
          });
        } else {
          // Non-default rules - don't save
          callback();
        }
      }
    });
  } else {
    callback();
  }
};

function buildParams(event) {
  let bucketName;
  let key;

  // Let's verify that this is a put event for our bucket
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].eventName == 'ObjectCreated:Put') {
      if (event.Records[0].s3 && event.Records[0].s3.bucket) {
        if (event.Records[0].s3.bucket.name === ANALYZEBUCKET) {
            bucketName = ANALYZEBUCKET;
        }
      }
      if (event.Records[0].s3 && event.Records[0].s3.object) {
        key = event.Records[0].s3.object.key;
      }
    }
  }

  if (key && bucketName) {
    return {Bucket: bucketName, Key: key};
  } else {
    return undefined;
  }
}

function isDefaultRules(game) {
  // Tournament is default
  if (game.game === 'tournament') {
    return true;
  } else {
    return ((game.rules.hitSoft17 == false) && (game.rules.surrender == 'late')
          && (game.rules.double == 'any') && (game.rules.doubleaftersplit == true)
          && (game.rules.resplitAces == false) && (game.rules.blackjackBonus == 0.5)
          && (game.rules.numberOfDecks == 1));
  }
}
