//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const redis = require('redis');

exports.handler = function(event, context) {
  // Clear the redis cache
  const leaderBoard = redis.createClient({host: process.env.REDISHOST});
  const now = Date.now();

  // Close the roulette tournament down on Fridays
  // And blackjack on Wednesdays
  if (now.getDay() == 5) {
    leaderBoard.zremrangebyrank('leaders-roulette-tournament', 0, -1, () => {
      leaderBoard.quit();
      closeTournament('roulette', (err) => {
        if (err) {
          console.log('Closing error: ' + err);
          context.fail(err);
        } else {
          console.log('Closed tournament!');
          context.succeed();
        }
      });
    });
  } else if (now.getDay() == 3) {
    leaderBoard.zremrangebyrank('leaders-blackjack-tournament', 0, -1, () => {
      leaderBoard.quit();
      closeTournament('blackjack', (err) => {
        if (err) {
          console.log('Closing error: ' + err);
          context.fail(err);
        } else {
          console.log('Closed tournament!');
          context.succeed();
        }
      });
    });
  } else {
    // Hmm ... we shouldn't have been called
    leaderBoard.quit();
    console.log('Error - not the right day to call tournmanet close!');
    context.fail('Wrong day');
  }
};

function closeTournament(skill, callback) {
  let highScore = 1;
  let players = 0;
  let spins = 0;
  let hands = 0;
  let tournamentClose;
  const skillMapping = {
    'blackjack': {dbName: 'PlayBlackjack', results: 'BlackjackTournamentResults.txt'},
    'roulette': {dbName: 'RouletteWheel', results: 'RouletteTournamentResults.txt'},
  };
  let closings;

  // Find the last tournament close time
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: skillMapping[skill].results}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback(err);
    } else {
      closings = JSON.parse(data.Body.toString('ascii'));
      closings.sort((a, b) => (b.timestamp - a.timestamp));
      tournamentClose = closings[0].timestamp;

      processDBEntries(skillMapping[skill].dbName,
        (attributes) => {
          if (attributes.tournament && attributes.tournament.timestamp
            && (attributes.tournament.timestamp > tournamentClose)) {
            players++;
            if (attributes.tournament.spins) {
              spins += attributes.tournament.spins;
            }
            if (attributes.tournament.hands) {
              hands += attributes.tournament.hands;
            }
            if (attributes.tournament.bankroll > highScore) {
              highScore = attributes.tournament.bankroll;
            }
          }
        },
        (err, results) => {
        if (err) {
          callback(err);
        } else {
          closings.push({timestamp: Date.now(),
                highScore: highScore,
                players: players,
                hands: hands,
                spins: spins});
          closings.sort((a, b) => (a.timestamp - b.timestamp));
          const params = {Body: JSON.stringify(closings),
            Bucket: 'garrett-alexa-usage',
            Key: skillMapping[skill].results};

          s3.putObject(params, (err, data) => {
            callback(err);
          });
        }
      });
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
           const entry = callback(data.Items[i].mapAttr);
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
