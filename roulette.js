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
  getRouletteMail: function(callback) {
    const american = {high: 0, spins: 0, players: 0, recentPlayers: 0};
    const european = {high: 0, spins: 0, players: 0, recentPlayers: 0};
    const tournament = {high: 0, spins: 0, players: 0};
    const adsPlayed = {};
    let spins;
    let text;
    let oldFormat = 0;
    let newFormat = 0;
    const now = Date.now();

    getLastCloseTime((tournamentClose) => {
      // Loop thru to read in all items from the DB
      (function loop(firstRun, startKey) {
        const params = {TableName: 'RouletteWheel'};

        if (firstRun || startKey) {
          params.ExclusiveStartKey = startKey;

          const scanPromise = dynamodb.scan(params).promise();
          return scanPromise.then((data) => {
            // OK, let's see where you rank among American and European players
            let i;

            utils.getAdSummary(data, adsPlayed);
            for (i = 0; i < data.Items.length; i++) {
               if (data.Items[i].mapAttr && data.Items[i].mapAttr.M) {
                 if (data.Items[i].mapAttr.M.highScore
                      && data.Items[i].mapAttr.M.highScore.M) {
                   // This is the old format
                   oldFormat++;

                   // Only counts if they spinned
                   const score = data.Items[i].mapAttr.M.highScore.M;
                   if (score.spinsAmerican && score.spinsAmerican.N) {
                     spins = parseInt(score.spinsAmerican.N);
                     american.spins += spins;
                     if (spins) {
                       american.players++;
                     }
                     if (parseInt(score.currentAmerican.N) > american.high) {
                       american.high = parseInt(score.currentAmerican.N);
                     }
                   }

                   if (score.spinsEuropean && score.spinsEuropean.N) {
                     spins = parseInt(score.spinsEuropean.N);
                     european.spins += spins;
                     if (spins) {
                       european.players++;
                     }
                     if (parseInt(score.currentEuropean.N) > european.high) {
                       european.high = parseInt(score.currentEuropean.N);
                     }
                   }
                 } else {
                   let scoreData;
                   newFormat++;

                   if (data.Items[i].mapAttr.M.american && data.Items[i].mapAttr.M.american.M) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.M.american.M;

                     if (scoreData.spins && scoreData.spins.N) {
                       spins = parseInt(scoreData.spins.N);
                       american.spins += spins;
                       if (spins) {
                         american.players++;
                       }
                       if (parseInt(scoreData.bankroll.N) > american.high) {
                         american.high = parseInt(scoreData.bankroll.N);
                       }
                       if (scoreData.timestamp && scoreData.timestamp.N) {
                         if ((now - parseInt(scoreData.timestamp.N)) < 24*60*60*1000) {
                           american.recentPlayers++;
                         }
                       }
                     }
                   }

                   if (data.Items[i].mapAttr.M.european && data.Items[i].mapAttr.M.european.M) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.M.european.M;

                     if (scoreData.spins && scoreData.spins.N) {
                       spins = parseInt(scoreData.spins.N);
                       european.spins += spins;
                       if (spins) {
                         european.players++;
                       }
                       if (parseInt(scoreData.bankroll.N) > european.high) {
                         european.high = parseInt(scoreData.bankroll.N);
                       }
                       if (scoreData.timestamp && scoreData.timestamp.N) {
                         if ((now - parseInt(scoreData.timestamp.N)) < 24*60*60*1000) {
                           european.recentPlayers++;
                         }
                       }
                     }
                   }

                   if (data.Items[i].mapAttr.M.tournament && data.Items[i].mapAttr.M.tournament.M) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.M.tournament.M;

                     // Skip this if the tournament closed since they played
                     if (scoreData.timestamp && scoreData.timestamp.N &&
                          (parseInt(scoreData.timestamp.N) > tournamentClose)) {
                       if (scoreData.spins && scoreData.spins.N) {
                         spins = parseInt(scoreData.spins.N);
                         tournament.spins += spins;
                         if (spins) {
                           tournament.players++;
                         }
                         if (parseInt(scoreData.bankroll.N) > tournament.high) {
                           tournament.high = parseInt(scoreData.bankroll.N);
                         }
                       }
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
        text = ('You have ' + american.players + ' players on an American wheel, ' + american.recentPlayers + ' of whom have played in the last 24 hours. ');
        text += ('In total they have done ' + american.spins + ' spins with a high score of ' + american.high + ' units.\r\n\r\n');
        text += ('You have ' + european.players + ' players on a European wheel, ' + european.recentPlayers + ' of whom have played in the last 24 hours. ');
        text += ('In total they have done ' + european.spins + ' spins with a high score of ' + european.high + ' units.\r\n\r\n');
        text += ('You have ' + tournament.players + ' people who have done ' + tournament.spins + ' total spins in the tournament with a high score of ' + tournament.high + ' units.\r\n');
        text += ('There are ' + newFormat + ' people on new-style attributes and ' + oldFormat + ' people with old-style attributes.\r\n\r\n');
        text += utils.getAdText(adsPlayed);
        callback(text);
      }).catch((err) => {
        text = 'Error getting Roulette results: ' + err;
        callback(text);
      });
    });
  },
  updateRouletteScores: function() {
    getRankFromDB((err, americanScores, europeanScores, tournamentScores) => {
      if (!err) {
        const scoreData = {timestamp: Date.now(),
          americanScores: americanScores,
          europeanScores: europeanScores};

        if (tournamentScores) {
          scoreData.tournamentScores = tournamentScores;
        }

        // Let's only write to S3 if these scores have changed
        checkScoreChange(scoreData, (diff) => {
          if (diff != 'same') {
            // It's not the same, so try to write it out
            const params = {Body: JSON.stringify(scoreData),
              Bucket: 'garrett-alexa-usage',
              Key: 'RouletteScores.txt'};

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
    getRankFromDB((err, americanScores, europeanScores, tournamentScores) => {
      if (err) {
        callback(err);
      } else {
        const highScore = (tournamentScores && tournamentScores[0]) ? tournamentScores[0] : 1;

        // Now get the list of completed tournaments to add to
        s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'RouletteTournamentResults.txt'}, (err, data) => {
          if (err) {
            callback(err);
          } else {
            const results = JSON.parse(data.Body.toString('ascii'));

            results.push({timestamp: Date.now(), highScore: highScore});
            results.sort((a, b) => (a.timestamp - b.timestamp));
            const params = {Body: JSON.stringify(results),
              Bucket: 'garrett-alexa-usage',
              Key: 'RouletteTournamentResults.txt'};

            s3.putObject(params, (err, data) => {
              callback(err);
            });
          }
        });
      }
    });
  },
};

// Function to get all the scores from the Database
function getRankFromDB(callback) {
  const americanScores = [];
  const europeanScores = [];
  const tournamentScores = [];
  let scoreData;

  // First find the last tournament close time
  getLastCloseTime((tournamentClose) => {
    // Loop thru to read in all items from the DB
    (function loop(firstRun, startKey) {
      const params = {TableName: 'RouletteWheel'};

      if (firstRun || startKey) {
        params.ExclusiveStartKey = startKey;

        const scanPromise = dynamodb.scan(params).promise();
        return scanPromise.then((data) => {
          // OK, let's see where you rank among American and European players
          let i;

          for (i = 0; i < data.Items.length; i++) {
            if (data.Items[i].mapAttr && data.Items[i].mapAttr.M) {
              if (data.Items[i].mapAttr.M.highScore
                    && data.Items[i].mapAttr.M.highScore.M) {
                // This is the old-style format
                // Only counts if they spinned
                const score = data.Items[i].mapAttr.M.highScore.M;
                const spinsAmerican = (score.spinsAmerican && score.spinsAmerican.N)
                      ? parseInt(score.spinsAmerican.N) : 0;
                const spinsEuropean = (score.spinsEuropean && score.spinsEuropean.N)
                      ? parseInt(score.spinsEuropean.N) : 0;
                const highAmerican = (score.currentAmerican && score.currentAmerican.N)
                      ? parseInt(score.currentAmerican.N) : 0;
                const highEuropean = (score.currentEuropean && score.currentEuropean.N)
                  ? parseInt(score.currentEuropean.N) : 0;

                 if (spinsAmerican) {
                   americanScores.push(highAmerican);
                 }
                 if (spinsEuropean) {
                   europeanScores.push(highEuropean);
                 }
              }

              // Check for new format
              if (data.Items[i].mapAttr.M.american && data.Items[i].mapAttr.M.american.M) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.M.american.M;
                const spins = (scoreData.spins && scoreData.spins.N)
                      ? parseInt(scoreData.spins.N) : 0;
                const high = (scoreData.bankroll && scoreData.bankroll.N)
                      ? parseInt(scoreData.bankroll.N) : 0;

                if (spins) {
                  americanScores.push(high);
                }
              }

              if (data.Items[i].mapAttr.M.european && data.Items[i].mapAttr.M.european.M) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.M.european.M;
                const spins = (scoreData.spins && scoreData.spins.N)
                      ? parseInt(scoreData.spins.N) : 0;
                const high = (scoreData.bankroll && scoreData.bankroll.N)
                      ? parseInt(scoreData.bankroll.N) : 0;

                if (spins) {
                  europeanScores.push(high);
                }
              }

              if (data.Items[i].mapAttr.M.tournament && data.Items[i].mapAttr.M.tournament.M) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.M.tournament.M;

                // Only count tournament scores that are still active
                if (scoreData.timestamp && scoreData.timestamp.N &&
                    (parseInt(scoreData.timestamp.N) > tournamentClose)) {
                  const spins = (scoreData.spins && scoreData.spins.N)
                        ? parseInt(scoreData.spins.N) : 0;
                  const high = (scoreData.bankroll && scoreData.bankroll.N)
                        ? parseInt(scoreData.bankroll.N) : 0;

                  if (spins) {
                    tournamentScores.push(high);
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
      americanScores.sort((a, b) => (b-a));
      europeanScores.sort((a, b) => (b-a));
      tournamentScores.sort((a, b) => (b-a));
      callback(null, americanScores, europeanScores, tournamentScores);
    }).catch((err) => {
      console.log('Error scanning: ' + err);
      callback(err, null, null, null);
    });
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'RouletteScores.txt'}, (err, data) => {
    if (err) {
      console.log(err, err.stack);
      callback('error');
    } else {
      // Get the scores array from the file
      const scores = JSON.parse(data.Body.toString('ascii'));
      const newTournament = (newScores.tournamentScores) ? newScores.tournamentScores.length : 0;
      const oldTournament = (scores.tournamentScores) ? scores.tournamentScores.length : 0;

      if ((newScores.americanScores.length != scores.americanScores.length) ||
        (newScores.europeanScores.length != scores.europeanScores.length) ||
        (newTournament != oldTournament)) {
        // They are different
        callback('different');
      } else {
        // Check if all alements are the same
        let i = 0;

        for (i = 0; i < scores.americanScores.length; i++) {
          if (scores.americanScores[i] != newScores.americanScores[i]) {
            callback('different');
            return;
          }
        }

        for (i = 0; i < scores.europeanScores.length; i++) {
          if (scores.europeanScores[i] != newScores.europeanScores[i]) {
            callback('different');
            return;
          }
        }

        if (oldTournament) {
          for (i = 0; i < scores.tournamentScores.length; i++) {
            if (scores.tournamentScores[i] != newScores.tournamentScores[i]) {
              callback('different');
              return;
            }
          }
        }

        // If we made it this far, we are the same
        callback('same');
      }
    }
  });
}

function getLastCloseTime(callback) {
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'RouletteTournamentResults.txt'}, (err, data) => {
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
