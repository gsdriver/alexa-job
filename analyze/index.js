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

        if (isDefaultRules(game)) {
          let key;
          let numCalls = 0;

          for (let i = 0; i < game.rounds.length; i++) {
            key = getKeyName(game.rounds[i], (i === 0), game.dealerCard);

            // First write the suggestion for this combination
            const params = {
              TableName: 'Blackjack_Analysis',
              Key: {
                cards: key,
              },
              AttributeUpdates: {
                suggestion: {
                  Action: 'PUT',
                  Value: game.rounds[i].suggestion,
                },
              },
            };

            // And what did the user do?
            params.AttributeUpdates[game.rounds[i].action] = {
              Action: 'ADD',
              Value: 1,
            };

            numCalls++;
            doc.update(params, (err, data) => {
              if (err) {
                console.log(err);
              }
              if (--numCalls === 0) {
                // All done
                callback();
              }
            });
          }
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

function getKeyName(round, firstRound, dealerCard) {
  let hasAces = false;
  let total = 0;
  let soft = false;
  let key = '';

  for (let i = 0; i < round.cards.length; i++) {
    total += round.cards[i];

    // Note if there's an ace
    if (round.cards[i] == 1) {
      hasAces = true;
    }
  }

  // If there are aces, add 10 to the total (unless it would go over 21)
  // Note that in this case the hand is soft
  if ((total <= 11) && hasAces) {
    total += 10;
    soft = true;
  }

  // Key name is of form H17-first-nopair-10
  // Indicating hard 17, first two cards in hand, no pair, dealer 10
  key += (soft) ? 'S' : 'H';
  key += '-' + total;
  key += '-' + ((firstRound) ? 'initial'
    : ((round.cards.length === 2) ? 'firsttwo' : 'notfirst'));
  key += '-' + (((round.cards.length === 2) && (round.cards[0] === round.cards[1])) ? 'pair' : 'nopair');
  key += '-' + dealerCard;
  return key;
}

