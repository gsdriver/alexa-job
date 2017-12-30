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
  getBlackjackMail: function(callback) {
    let text;

    getEntriesFromDB((err, results, newads) => {
      if (err) {
        callback('Error getting blackjack data: ' + err);
      } else {
        let i;
        const players = {};
        let recentPlayers = 0;
        const now = Date.now();
        let isRecent;

        for (i = 0; i < results.length; i++) {
          if (players[results[i].locale]) {
            players[results[i].locale]++;
          } else {
            players[results[i].locale] = 1;
          }

          isRecent = false;
          if (results[i].standard) {
            const standard = results[i].standard;
            if (standard.timestamp &&
              ((now - standard.timestamp) < 24*60*60*1000)) {
              isRecent = true;
            }
          }
          if (results[i].tournament) {
            const tournament = results[i].tournament;
            if (tournament.timestamp &&
              ((now - tournament.timestamp) < 24*60*60*1000)) {
              isRecent = true;
            }
          }
          if (isRecent) {
            recentPlayers++;
          }
        }

        // Get the progressive information for standard
        getProgressive('standard', (game, progressiveHands, jackpots) => {
          const rows = [];

          rows.push(utils.getSummaryTableRow('Total Players', results.length));
          rows.push(utils.getSummaryTableRow('Past 24 Hours', recentPlayers));
          rows.push(utils.getSummaryTableRow('American Players', players['en-US']));
          rows.push(utils.getSummaryTableRow('UK Players', players['en-GB']));
          rows.push(utils.getSummaryTableRow('Canadian Players', players['en-CA'] ? players['en-CA'] : 0));
          rows.push(utils.getSummaryTableRow('Indian Players', players['en-IN'] ? players['en-IN'] : 0));
          rows.push(utils.getSummaryTableRow('Progressive Hands', progressiveHands));

          text = utils.getSummaryTable('BLACKJACK', rows);
          text += utils.getAdText(newads);
          callback(text);
        });
      }
    });
  },
  getFacebookIDs: function(callback) {
    const users = [];
    let i;

    getEntriesFromDB((err, results, newads) => {
      for (i = 0; i < results.length; i++) {
        if (results[i].facebookID) {
          users.push({id: results[i].facebookID,
            name: results[i].firstName,
            email: results[i].email});
        }
      }

      callback(users);
    });
  },
  getAchievementScores: function(callback) {
    getEntriesFromDB((err, results, newads) => {
      if (err) {
        callback(err, null);
      } else {
        const daysPlayed = {};

        results.forEach((result) => {
          if (result.daysPlayed) {
            daysPlayed[result.daysPlayed] = (daysPlayed[result.daysPlayed] + 1) || 1;
          }
        });
        callback(null, daysPlayed);
      }
    });
  },
  getActivePlayers: function(callback) {
    // An active player is one who played in the past week
    getEntriesFromDB((err, results) => {
      if (err) {
        callback(err, null);
      } else {
        const players = [];
        let timestamp;
        const now = Date.now();

        results.forEach((result) => {
          timestamp = undefined;
          if (result.standard) {
            const standard = result.standard;
            if (standard.timestamp &&
              ((now - standard.timestamp) < 7*24*60*60*1000)) {
              timestamp = standard.timestamp;
            }
          }
          if (result.tournament) {
            const tournament = result.tournament;
            if (tournament.timestamp &&
              ((now - tournament.timestamp) < 7*24*60*60*1000)) {
              if (!timestamp || (tournament.timestamp > timestamp)) {
                timestamp = tournament.timestamp;
              }
            }
          }
          if (timestamp) {
            players.push({last: timestamp, first: result.firstPlay});
          }
        });
        callback(null, players);
      }
    });
  },
  updateBlackjackScores: function() {
    getEntriesFromDB((err, results, newads) => {
      if (!err) {
        const scoreData = {timestamp: Date.now()};
        // Only support standard and tournament for now
        const scores = {standard: [], tournament: []};
        let i;

        for (i = 0; i < results.length; i++) {
          if (results[i].standard && results[i].standard.bankroll) {
            scores.standard.push({name: results[i].firstName,
                bankroll: results[i].standard.bankroll,
                achievementScore: results[i].achievementScore});
          }
          if (results[i].tournament && results[i].tournament.bankroll) {
            scores.tournament.push({name: results[i].firstName,
                bankroll: results[i].tournament.bankroll});
          }
        }

        scores.standard.sort((a, b) => (b.achievementScore - a.achievementScore));
        scores.tournament.sort((a, b) => (b.bankroll - a.bankroll));
        scoreData.scores = scores;

        // Only write bankroll to S3 if it has changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'BlackjackScores.txt'};

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
  closeTournament: function(callback) {
    getEntriesFromDB((err, results, newads) => {
      if (err) {
        callback(err);
      } else {
        // What's the high score?
        let highScore = 1;
        let i;
        let players = 0;
        let hands = 0;

        for (i = 0; i < results.length; i++) {
          if (results[i].tournament) {
            players++;
            if (results[i].tournament.hands) {
              hands += results[i].tournament.hands;
            }
            if (results[i].tournament.bankroll > highScore) {
              highScore = results[i].tournament.bankroll;
            }
          }
        }

        // Now get the list of completed tournaments to add to
        s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'BlackjackTournamentResults.txt'}, (err, data) => {
          if (err) {
            callback(err);
          } else {
            const results = JSON.parse(data.Body.toString('ascii'));

            results.push({timestamp: Date.now(),
              highScore: highScore,
              players: players,
              hands: hands});
            results.sort((a, b) => (a.timestamp - b.timestamp));
            const params = {Body: JSON.stringify(results),
              Bucket: 'garrett-alexa-usage',
              Key: 'BlackjackTournamentResults.txt'};

            s3.putObject(params, (err, data) => {
              callback(err);
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

  getLastCloseTime((tournamentClose) => {
    // Loop thru to read in all items from the DB
    (function loop(firstRun, startKey) {
     const params = {TableName: 'PlayBlackjack'};

     if (firstRun || startKey) {
       params.ExclusiveStartKey = startKey;

       const scanPromise = doc.scan(params).promise();
       return scanPromise.then((data) => {
         let i;

         utils.getAdSummaryDoc(data, newads);
         for (i = 0; i < data.Items.length; i++) {
           if (data.Items[i].mapAttr) {
             const entry = {};

             // Calculate achievement score
             entry.firstPlay = utils.getFirstPlayFromAds(data.Items[i].mapAttr.adsPlayed);
             entry.achievementScore = utils.getAchievementScore('blackjack', data.Items[i].mapAttr);
             if (data.Items[i].mapAttr.achievements
                && data.Items[i].mapAttr.achievements.daysPlayed) {
               entry.daysPlayed = parseInt(data.Items[i].mapAttr.achievements.daysPlayed);
             }

             if (data.Items[i].mapAttr.numRounds) {
               entry.numRounds = parseInt(data.Items[i].mapAttr.numRounds);
             }
             if (data.Items[i].mapAttr.playerLocale) {
               entry.locale = data.Items[i].mapAttr.playerLocale;
             }
             if (data.Items[i].mapAttr.standard) {
               const standardGame = data.Items[i].mapAttr.standard;

               entry.standard = {};
               entry.nonService = true;
               if (standardGame.hands) {
                 entry.standard.hands = parseInt(standardGame.hands);
               }
               if (standardGame.timestamp) {
                 entry.standard.timestamp = parseInt(standardGame.timestamp);
               }
               // Only count bankroll if it looks like they played
               if (standardGame.bankroll) {
                 const bankroll = parseInt(standardGame.bankroll);

                 if (entry.standard.hands || (bankroll !== 5000)) {
                   entry.standard.bankroll = parseInt(standardGame.bankroll);
                 }
               }
             }

            if (data.Items[i].mapAttr.tournament) {
              const tournament = data.Items[i].mapAttr.tournament;

              // Only count tournament scores that are still active
              if (tournament.timestamp &&
                  (parseInt(tournament.timestamp) > tournamentClose)) {
                entry.tournament = {};
                if (tournament.hands) {
                  entry.tournament.hands = parseInt(tournament.hands);
                }
                entry.tournament.timestamp = parseInt(tournament.timestamp);
                // Only count bankroll if it looks like they played
                if (tournament.bankroll) {
                  const bankroll = parseInt(tournament.bankroll);

                  if (entry.hands || (bankroll !== 5000)) {
                    entry.tournament.bankroll = parseInt(tournament.bankroll);
                  }
                }
              }
            }
             results.push(entry);
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
      console.log(err.stack);
      callback(err, null, null);
    });
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'BlackjackScores.txt'}, (err, data) => {
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
              if ((scores[game][i].name != newScores[game][i].name)
                || (scores[game][i].bankroll != newScores[game][i].bankroll)
                || (scores[game][i].achievementScore != newScores[game][i].achievementScore)) {
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

function getProgressive(game, callback) {
  // Read from database
  doc.get({TableName: 'PlayBlackjack', Key: {userId: 'game-' + game}},
          (err, data) => {
    if (err || (data.Item === undefined)) {
      callback(game, undefined);
    } else {
      // Do we have
      let hands;
      let jackpots;

      if (data.Item.hands) {
        hands = parseInt(data.Item.hands);
      }
      if (data.Item.jackpots) {
        jackpots = parseInt(data.Item.jackpots);
      }

      callback(game, hands, jackpots);
    }
  });
}

function getLastCloseTime(callback) {
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'BlackjackTournamentResults.txt'}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback(0);
    } else {
      // Yeah, I can do a binary search (this is sorted), but straight search for now
      const results = JSON.parse(data.Body.toString('ascii'));

      results.sort((a, b) => (b.timestamp - a.timestamp));
      callback(results[0].timestamp);
    }
  });
}
