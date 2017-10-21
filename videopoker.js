//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const utils = require('./utils');

module.exports = {
  // Generates the text for blackjack e-mail summary
  getPokerMail: function(callback) {
    let text = '';

    getEntriesFromDB((err, results, newads) => {
      if (err) {
        callback('Error getting video poker data: ' + err);
      } else {
        const games = {};
        let thisGame;
        let i;
        let numGames = 0;
        const now = Date.now();

        for (i = 0; i < results.length; i++) {
          if (!games[results[i].game]) {
            games[results[i].game] = {
              players: 0,
              totalSpins: 0,
              totalJackpots: 0,
              maxSpins: 0,
              recentGames: 0,
            };

            numGames++;
          }

          thisGame = games[results[i].game];
          thisGame.players++;
          thisGame.totalSpins += results[i].spins;
          thisGame.totalJackpots += results[i].jackpot;

          // Was this game played in the last 24 hours?
          if (results[i].timestamp &&
            ((now - results[i].timestamp) < 24*60*60*1000)) {
            thisGame.recentGames++;
          }

          if (results[i].spins > thisGame.maxSpins) {
            thisGame.maxSpins = results[i].spins;
          }
        }

        // Get the progressive jackpot
        let game;
        let readGames = 0;
        for (game in games) {
          if (game) {
            getProgressive(game, (game, coins) => {
              text += 'For ' + game + ' there are ' + games[game].players + ' total players ';
              text += 'of whom ' + games[game].recentGames + ' have played in the past 24 hours.  ';
              text += ('There have been a total of ' + games[game].totalSpins + ' spins and ' + games[game].totalJackpots + ' jackpots. ');

              if (coins && (coins > 0)) {
                text += ('There are ' + coins + ' coins towards the next progressive jackpot. ');
              }

              text += games[game].maxSpins + ' is the most spins played by one person.\r\n\r\n';

              // Are we done?
              readGames++;
              if (readGames === numGames) {
                text += utils.getAdText(newads);
                callback(text);
              }
            });
          }
        }
      }
    });
  },
  updatePokerScores: function() {
    getEntriesFromDB((err, results, newads) => {
      if (!err) {
        const scoreData = {timestamp: Date.now()};

        const scores = {};

        results.forEach((score) => {
          if (!scores[score.game]) {
            scores[score.game] = [];
          }

          if (score.high) {
            scores[score.game].push(score.high);
          }
        });

        let game;
        for (game in scores) {
          if (game) {
            scores[game].sort((a, b) => (b - a));
          }
        }

        scoreData.scores = scores;

        // Only write high scores to S3 if they have changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'VideoPokerScores.txt'};

            s3.putObject(params, (err, data) => {
              if (err) {
                console.log(err, err.stack);
              }
            });
          }
        });
      }
    });
  },
};

// Function to get all the entries from the Database
function getEntriesFromDB(callback) {
  const results = [];
  const newads = [];

  // Loop thru to read in all items from the DB
  (function loop(firstRun, startKey) {
    const params = {TableName: 'VideoPoker'};

    if (firstRun || startKey) {
      params.ExclusiveStartKey = startKey;

      const scanPromise = dynamodb.scan(params).promise();
      return scanPromise.then((data) => {
        let i;

        utils.getAdSummary(data, newads);
        for (i = 0; i < data.Items.length; i++) {
          if (data.Items[i].mapAttr && data.Items[i].mapAttr.M) {
            let game;

            for (game in data.Items[i].mapAttr.M) {
              if (game) {
                const entry = getEntryForGame(data.Items[i], game);
                if (entry) {
                  results.push(entry);
                }
              }
            }
          }
        }

        if (data.LastEvaluatedKey) {
          return loop(false, data.LastEvaluatedKey);
        }
      });
    }
  })(true, null).then(() => {
    callback(null, results, newads);
  }).catch((err) => {
    callback(err, null), null;
  });
}

function getEntryForGame(item, game) {
  let entry;

  if (item.mapAttr && item.mapAttr.M
    && item.mapAttr.M[game] && item.mapAttr.M[game].M) {
     if (item.mapAttr.M[game].M.spins) {
       const spins = parseInt(item.mapAttr.M[game].M.spins.N);

       entry = {game: game};
       entry.spins = isNaN(spins) ? 0 : spins;
       if (item.mapAttr.M[game].M.bankroll) {
         const bankroll = parseInt(item.mapAttr.M[game].M.bankroll.N);
         entry.high = isNaN(bankroll) ? 0 : bankroll;
       }

      if (item.mapAttr.M[game].M.jackpot) {
        const jackpot = parseInt(item.mapAttr.M[game].M.jackpot.N);

        entry.jackpot = isNaN(jackpot) ? 0 : jackpot;
      } else {
        entry.jackpot = 0;
      }

      if (item.mapAttr.M[game].M.timestamp
        && item.mapAttr.M[game].M.timestamp.N) {
        entry.timestamp = parseInt(item.mapAttr.M[game].M.timestamp.N);
      }
    }
  }

  return entry;
}

function getProgressive(game, callback) {
  // Read from Dynamodb
  dynamodb.getItem({TableName: 'Slots', Key: {userId: {S: 'game-' + game}}},
          (err, data) => {
    if (err || (data.Item === undefined)) {
      callback(game, undefined);
    } else {
      // Do we have
      let coins;

      if (data.Item.coins && data.Item.coins.N) {
        coins = parseInt(data.Item.coins.N);
      }

      callback(game, coins);
    }
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'SlotMachineScores2.txt'}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback('error');
    } else {
      // Get the scores array from the file
      const currentScoreData = JSON.parse(data.Body.toString('ascii'));
      let game;
      let oldLength;
      let newLength;
      const scores = (currentScoreData) ? (currentScoreData.scores) : undefined;

      for (game in newScores) {
        if (game) {
          if (!scores || !scores[game]) {
            callback('different');
            return;
          }

          oldLength = (scores[game]) ? scores[game].length : 0;
          newLength = (newScores[game]) ? newScores[game].length : 0;

          if (oldLength != newLength) {
            // They are different
            callback('different');
            return;
          } else {
            // Check if all alements are the same
            let i = 0;

            for (i = 0; i < newLength; i++) {
              if (scores[game][i] != newScores[game][i]) {
                callback('different');
                return;
              }
            }
          }
        }
      }

      // If we made it this far, we are the same
      callback('same');
    }
  });
}
