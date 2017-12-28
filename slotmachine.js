//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const utils = require('./utils');

module.exports = {
  // Generates the text for blackjack e-mail summary
  getSlotsMail: function(callback) {
    let text = '';

    getEntriesFromDB((err, results, achievementScores, newads, players) => {
      if (err) {
        callback('Error getting slotmachine data: ' + err);
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
              highScore: 0,
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
          if (results[i].high > thisGame.highScore) {
            thisGame.highScore = results[i].high;
          }
        }

        // Get the progressive jackpot
        let game;
        let readGames = 0;
        const rows = [];

        rows.push(utils.getSummaryTableRow('Total Players', players['total']));
        if (players['en-US']) {
          rows.push(utils.getSummaryTableRow('American Players', players['en-US']));
        }
        if (players['en-GB']) {
          rows.push(utils.getSummaryTableRow('British Players', players['en-GB']));
        }
        if (players['en-CA']) {
          rows.push(utils.getSummaryTableRow('Canadian Players', players['en-CA']));
        }
        if (players['en-IN']) {
          rows.push(utils.getSummaryTableRow('Indian Players', players['en-IN']));
        }
        if (players['en-AU']) {
          rows.push(utils.getSummaryTableRow('Australian Players', players['en-AU']));
        }

        for (game in games) {
          if (game) {
            getProgressive(game, (game, coins) => {
              rows.push(utils.getSummaryTableRow('Total ' + game + ' Players', games[game].players));
              rows.push(utils.getSummaryTableRow('Past 24 Hours', games[game].recentGames));
              rows.push(utils.getSummaryTableRow('Total Spins', games[game].totalSpins));
              rows.push(utils.getSummaryTableRow('Jackpots', games[game].totalJackpots));
              if (coins && (coins > 0)) {
                rows.push(utils.getSummaryTableRow('Progressive Coins', coins));
              }

              // Are we done?
              readGames++;
              if (readGames === numGames) {
                text = utils.getSummaryTable('SLOT MACHINE', rows);
                text += utils.getAdText(newads);
                callback(text);
              }
            });
          }
        }
      }
    });
  },
  updateSlotMachineScores: function() {
    getEntriesFromDB((err, results, achievementScores, newads) => {
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

        achievementScores.sort((a, b) => (b - a));
        scores.achievementScores = achievementScores;
        scoreData.scores = scores;

        // Only write high scores to S3 if they have changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'SlotMachineScores.txt'};

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
  const achievementScores = [];
  const players = {};

  // Loop thru to read in all items from the DB
  (function loop(firstRun, startKey) {
    const params = {TableName: 'Slots'};

    if (firstRun || startKey) {
      params.ExclusiveStartKey = startKey;

      const scanPromise = doc.scan(params).promise();
      return scanPromise.then((data) => {
        let i;

        utils.getAdSummaryDoc(data, newads);
        for (i = 0; i < data.Items.length; i++) {
          if (data.Items[i].mapAttr) {
            let game;

            for (game in data.Items[i].mapAttr) {
              if (game) {
                const entry = getEntryForGame(data.Items[i], game);
                if (entry) {
                  results.push(entry);
                }
              }
            }

            let score = 0;
            if (data.Items[i].mapAttr.achievements) {
              const achievements = data.Items[i].mapAttr.achievements;

              if (achievements.gamedaysPlayed) {
                score += 10 * achievements.gamedaysPlayed;
              }
              if (achievements.jackpot) {
                score += 25 * achievements.jackpot;
              }
              if (achievements.streakScore) {
                score += achievements.streakScore;
              }
            }
            console.log(score);
            achievementScores.push(score);

            const locale = data.Items[i].mapAttr.playerLocale;
            if (locale) {
              players[locale] = (players[locale] + 1) || 1;
            }
            players.total = (players.total + 1) || 1;
          }
        }

        if (data.LastEvaluatedKey) {
          return loop(false, data.LastEvaluatedKey);
        }
      });
    }
  })(true, null).then(() => {
    callback(null, results, achievementScores, newads, players);
  }).catch((err) => {
    callback(err, null), null;
  });
}

function getEntryForGame(item, game) {
  let entry;

  if (item.mapAttr && item.mapAttr[game]) {
     if (item.mapAttr[game].spins) {
       const spins = parseInt(item.mapAttr[game].spins);

       entry = {game: game};
       entry.spins = isNaN(spins) ? 0 : spins;
       if (item.mapAttr[game].bankroll) {
         const high = parseInt(item.mapAttr[game].bankroll);
         entry.high = isNaN(high) ? 0 : high;
       }

      if (item.mapAttr[game].jackpot) {
        const jackpot = parseInt(item.mapAttr[game].jackpot);

        entry.jackpot = isNaN(jackpot) ? 0 : jackpot;
      } else {
        entry.jackpot = 0;
      }

      if (item.mapAttr[game].timestamp) {
        entry.timestamp = parseInt(item.mapAttr[game].timestamp);
      }
    }
  }

  return entry;
}

function getProgressive(game, callback) {
  // Read from database
  doc.get({TableName: 'Slots', Key: {userId: {S: 'game-' + game}}},
          (err, data) => {
    if (err || (data.Item === undefined)) {
      callback(game, undefined);
    } else {
      // Do we have
      let coins;

      if (data.Item.coins) {
        coins = parseInt(data.Item.coins);
      }

      callback(game, coins);
    }
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'SlotMachineScores.txt'}, (err, data) => {
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
