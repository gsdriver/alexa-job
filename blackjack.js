//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const utils = require('./utils');
const speechUtils = require('alexa-speech-utils')();

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
        let standardRecent = 0;
        const now = Date.now();
        const registered = [];

        for (i = 0; i < results.length; i++) {
          if (players[results[i].locale]) {
            players[results[i].locale]++;
          } else {
            players[results[i].locale] = 1;
          }

          if (results[i].standard) {
            const standard = results[i].standard;
            if (standard.timestamp &&
              ((now - standard.timestamp) < 24*60*60*1000)) {
              standardRecent++;
            }
          }

          if (results[i].firstName) {
            registered.push(results[i].firstName);
          }
        }

        let registeredText = '';
        if (registered.length) {
          registeredText = 'The following individuals have registered: ' + speechUtils.and(registered) + '\r\n';
        }

        // Get the progressive information for standard
        getProgressive('standard', (game, progressiveHands, jackpots) => {
          text = 'Of ' + results.length + ' registered players ';
          text += standardRecent + ' have played in the past 24 hours. ';
          text += 'There are ' + players['en-US'] + ' American players and ' + players['en-GB'] + ' UK players. ';
          text += ('There have been ' + progressiveHands + ' hands played towards the progressive. The jackpot has been hit ' + jackpots + ' times.\r\n');
          text += registeredText;
          text += utils.getAdText(newads);
          callback(text);
        });
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
                bankroll: results[i].standard.bankroll});
          }
          if (results[i].tournament && results[i].tournament.bankroll) {
            scores.tournament.push({name: results[i].firstName,
                bankroll: results[i].tournament.bankroll});
          }
        }

        scores.standard.sort((a, b) => (b.bankroll - a.bankroll));
        scores.tournament.sort((a, b) => (b.bankroll - a.bankroll));
        scoreData.scores = scores;

        // Only write bankroll to S3 if it has changed
        checkScoreChange(scoreData.scores, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'BlackjackScores2.txt'};

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

       const scanPromise = dynamodb.scan(params).promise();
       return scanPromise.then((data) => {
         let i;

         utils.getAdSummary(data, newads);
         for (i = 0; i < data.Items.length; i++) {
           if (data.Items[i].mapAttr && data.Items[i].mapAttr.M) {
             const entry = {};

             if (data.Items[i].mapAttr.M.numRounds) {
               entry.numRounds = parseInt(data.Items[i].mapAttr.M.numRounds.N);
             }
             if (data.Items[i].mapAttr.M.playerLocale) {
               entry.locale = data.Items[i].mapAttr.M.playerLocale.S;
             }
             if (data.Items[i].mapAttr.M.firstName) {
               entry.firstName = data.Items[i].mapAttr.M.firstName.S;
             }
             entry.adplayed = (data.Items[i].mapAttr.M.adStamp != undefined);
             if (data.Items[i].mapAttr.M.standard && data.Items[i].mapAttr.M.standard.M) {
               const standardGame = data.Items[i].mapAttr.M.standard.M;

               entry.standard = {};
               entry.nonService = true;
               if (standardGame.hands && standardGame.hands.N) {
                 entry.standard.hands = parseInt(standardGame.hands.N);
               }
               if (standardGame.timestamp && standardGame.timestamp.N) {
                 entry.standard.timestamp = parseInt(standardGame.timestamp.N);
               }
               // Only count bankroll if it looks like they played
               if (standardGame.bankroll && standardGame.bankroll.N) {
                 const bankroll = parseInt(standardGame.bankroll.N);

                 if (entry.standard.hands || (bankroll !== 5000)) {
                   entry.standard.bankroll = parseInt(standardGame.bankroll.N);
                 }
               }
             }

            if (data.Items[i].mapAttr.M.tournament && data.Items[i].mapAttr.M.tournament.M) {
              const tournament = data.Items[i].mapAttr.M.tournament.M;

              // Only count tournament scores that are still active
              if (tournament.timestamp && tournament.timestamp.N &&
                  (parseInt(tournament.timestamp.N) > tournamentClose)) {
                entry.tournament = {};
                if (tournament.hands && tournament.hands.N) {
                  entry.tournament.hands = parseInt(tournament.hands.N);
                }
                entry.tournament.timestamp = parseInt(tournament.timestamp.N);
                // Only count bankroll if it looks like they played
                if (tournament.bankroll && tournament.bankroll.N) {
                  const bankroll = parseInt(tournament.bankroll.N);

                  if (entry.hands || (bankroll !== 5000)) {
                    entry.tournament.bankroll = parseInt(tournament.bankroll.N);
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
      callback(err, null), null;
    });
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'BlackjackScores2.txt'}, (err, data) => {
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
                || (scores[game][i].bankroll != newScores[game][i].bankroll)) {
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
  // Read from Dynamodb
  dynamodb.getItem({TableName: 'PlayBlackjack', Key: {userId: {S: 'game-' + game}}},
          (err, data) => {
    if (err || (data.Item === undefined)) {
      callback(game, undefined);
    } else {
      // Do we have
      let hands;
      let jackpots;

      if (data.Item.hands && data.Item.hands.N) {
        hands = parseInt(data.Item.hands.N);
      }
      if (data.Item.jackpots && data.Item.jackpots.N) {
        jackpots = parseInt(data.Item.jackpots.N);
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
