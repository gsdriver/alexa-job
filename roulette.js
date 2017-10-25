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
  getRouletteMail: function(callback) {
    const american = {players: 0, recentPlayers: 0};
    const european = {players: 0, recentPlayers: 0};
    const tournament = {high: 0, spins: 0, players: 0};
    const adsPlayed = {};
    let spins;
    let text;
    const now = Date.now();

    getLastCloseTime((tournamentClose) => {
      // Loop thru to read in all items from the DB
      (function loop(firstRun, startKey) {
        const params = {TableName: 'RouletteWheel'};

        if (firstRun || startKey) {
          params.ExclusiveStartKey = startKey;

          const scanPromise = doc.scan(params).promise();
          return scanPromise.then((data) => {
            // OK, let's see where you rank among American and European players
            let i;

            utils.getAdSummaryDoc(data, adsPlayed);
            for (i = 0; i < data.Items.length; i++) {
               if (data.Items[i].mapAttr) {
                 if (data.Items[i].mapAttr.highScore) {
                   // Only counts if they spinned
                   const score = data.Items[i].mapAttr.highScore;
                   if (score.spinsAmerican) {
                     spins = parseInt(score.spinsAmerican);
                     if (spins) {
                       american.players++;
                     }
                   }

                   if (score.spinsEuropean) {
                     spins = parseInt(score.spinsEuropean);
                     if (spins) {
                       european.players++;
                     }
                   }
                 } else {
                   let scoreData;

                   if (data.Items[i].mapAttr.american) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.american;

                     if (scoreData.spins) {
                       spins = parseInt(scoreData.spins);
                       if (spins) {
                         american.players++;
                       }
                       if (scoreData.timestamp) {
                         if ((now - parseInt(scoreData.timestamp)) < 24*60*60*1000) {
                           american.recentPlayers++;
                         }
                       }
                     }
                   }

                   if (data.Items[i].mapAttr.european) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.european;

                     if (scoreData.spins) {
                       spins = parseInt(scoreData.spins);
                       if (spins) {
                         european.players++;
                       }
                       if (scoreData.timestamp) {
                         if ((now - parseInt(scoreData.timestamp)) < 24*60*60*1000) {
                           european.recentPlayers++;
                         }
                       }
                     }
                   }

                   if (data.Items[i].mapAttr.tournament) {
                     // This is the new format
                     scoreData = data.Items[i].mapAttr.tournament;

                     // Skip this if the tournament closed since they played
                     if (scoreData.timestamp &&
                          (parseInt(scoreData.timestamp) > tournamentClose)) {
                       if (scoreData.spins) {
                         spins = parseInt(scoreData.spins);
                         tournament.spins += spins;
                         if (spins) {
                           tournament.players++;
                         }
                         if (parseInt(scoreData.bankroll) > tournament.high) {
                           tournament.high = parseInt(scoreData.bankroll);
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
        text += ('You have ' + european.players + ' players on a European wheel, ' + european.recentPlayers + ' of whom have played in the last 24 hours. ');
        if (tournament.players) {
          text += ('You have ' + tournament.players + ' people who have done ' + tournament.spins + ' total spins in the tournament with a high score of ' + tournament.high + ' units.\r\n');
        }
        text += utils.getAdText(adsPlayed);
        callback(text);
      }).catch((err) => {
        text = 'Error getting Roulette results: ' + err;
        callback(text);
      });
    });
  },
  updateRouletteScores: function() {
    getRankFromDB((err, americanScores, europeanScores,
          tournamentScores, achievementScores, daysPlayed) => {
      if (!err) {
        const scoreData = {timestamp: Date.now(),
          achievementScores: achievementScores,
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
              Key: 'RouletteScores2.txt'};

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
  getAchievementScores: function(callback) {
    getRankFromDB((err, americanScores, europeanScores, tournamentScores,
          achievementScores, spins, daysPlayed) => {
      callback(err, daysPlayed);
    });
  },
  closeTournament: function(callback) {
    getRankFromDB((err, americanScores, europeanScores, tournamentScores,
          achievementScores, spins, daysPlayed) => {
      if (err) {
        callback(err);
      } else {
        const highScore = (tournamentScores && tournamentScores[0])
            ? tournamentScores[0].bankroll : 1;
        const players = (tournamentScores ? tournamentScores.length : 0);

        // Now get the list of completed tournaments to add to
        s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'RouletteTournamentResults.txt'}, (err, data) => {
          if (err) {
            callback(err);
          } else {
            const results = JSON.parse(data.Body.toString('ascii'));

            results.push({timestamp: Date.now(), highScore: highScore,
                  players: players, spins: spins});
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
  const achievementScores = [];
  const daysPlayed = {};
  let tournamentSpins = 0;
  let scoreData;

  // First find the last tournament close time
  getLastCloseTime((tournamentClose) => {
    // Loop thru to read in all items from the DB
    (function loop(firstRun, startKey) {
      const params = {TableName: 'RouletteWheel'};

      if (firstRun || startKey) {
        params.ExclusiveStartKey = startKey;

        const scanPromise = doc.scan(params).promise();
        return scanPromise.then((data) => {
          // OK, let's see where you rank among American and European players
          let i;

          for (i = 0; i < data.Items.length; i++) {
            if (data.Items[i].mapAttr) {
              const firstName = data.Items[i].mapAttr.firstName;

              // Calculate achievement score
              let achievementScore = 0;
              if (data.Items[i].mapAttr.achievements) {
                const achievements = data.Items[i].mapAttr.achievements;
                if (achievements.trophy) {
                 achievementScore += 100 * parseInt(achievements.trophy);
                }
                if (achievements.daysPlayed) {
                 const days = parseInt(achievements.daysPlayed);

                 achievementScore += 10 * days;
                 daysPlayed[days] = (daysPlayed[days] + 1) || 1;
                }
                if (achievements.streakScore) {
                 achievementScore += parseInt(achievements.streakScore);
                }
              }
              achievementScores.push(achievementScore);

              if (data.Items[i].mapAttr.highScore) {
                // This is the old-style format
                // Only counts if they spinned
                const score = data.Items[i].mapAttr.highScore;
                const spinsAmerican = (score.spinsAmerican)
                      ? parseInt(score.spinsAmerican) : 0;
                const spinsEuropean = (score.spinsEuropean)
                      ? parseInt(score.spinsEuropean) : 0;
                const highAmerican = (score.currentAmerican)
                      ? parseInt(score.currentAmerican) : 0;
                const highEuropean = (score.currentEuropean)
                  ? parseInt(score.currentEuropean) : 0;

                 if (spinsAmerican) {
                   americanScores.push({name: firstName, bankroll: highAmerican});
                 }
                 if (spinsEuropean) {
                   europeanScores.push({name: firstName, bankroll: highEuropean});
                 }
              }

              // Check for new format
              if (data.Items[i].mapAttr.american) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.american;
                const spins = (scoreData.spins)
                      ? parseInt(scoreData.spins) : 0;
                const high = (scoreData.bankroll)
                      ? parseInt(scoreData.bankroll) : 0;

                if (spins) {
                  americanScores.push({name: firstName, bankroll: high});
                }
              }

              if (data.Items[i].mapAttr.european) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.european;
                const spins = (scoreData.spins)
                      ? parseInt(scoreData.spins) : 0;
                const high = (scoreData.bankroll)
                      ? parseInt(scoreData.bankroll) : 0;

                if (spins) {
                  europeanScores.push({name: firstName, bankroll: high});
                }
              }

              if (data.Items[i].mapAttr.tournament) {
                // This is the new format
                scoreData = data.Items[i].mapAttr.tournament;

                // Only count tournament scores that are still active
                if (scoreData.timestamp &&
                    (parseInt(scoreData.timestamp) > tournamentClose)) {
                  const spins = (scoreData.spins)
                        ? parseInt(scoreData.spins) : 0;
                  const high = (scoreData.bankroll)
                        ? parseInt(scoreData.bankroll) : 0;

                  if (spins) {
                    tournamentScores.push({name: firstName, bankroll: high});
                    tournamentSpins += spins;
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
      americanScores.sort((a, b) => (b.bankroll - a.bankroll));
      europeanScores.sort((a, b) => (b.bankroll - a.bankroll));
      tournamentScores.sort((a, b) => (b.bankroll - a.bankroll));
      achievementScores.sort((a, b) => (b - a));
      callback(null, americanScores, europeanScores, tournamentScores,
            achievementScores, tournamentSpins, daysPlayed);
    }).catch((err) => {
      console.log('Error scanning: ' + err);
      callback(err);
    });
  });
}

function checkScoreChange(newScores, callback) {
  // Read the S3 buckets that has everyone's scores
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'RouletteScores2.txt'}, (err, data) => {
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
        (newScores.achievementScores.length != scores.achievementScores.length) ||
        (newTournament != oldTournament)) {
        // They are different
        callback('different');
      } else {
        // Check if all alements are the same
        let i = 0;

        for (i = 0; i < scores.americanScores.length; i++) {
          if ((scores.americanScores[i].name != newScores.americanScores[i].name)
              || (scores.americanScores[i].bankroll != newScores.americanScores[i].bankroll)) {
            callback('different');
            return;
          }
        }

        for (i = 0; i < scores.europeanScores.length; i++) {
          if ((scores.europeanScores[i].name != newScores.europeanScores[i].name)
              || (scores.europeanScores[i].bankroll != newScores.europeanScores[i].bankroll)) {
            callback('different');
            return;
          }
        }

        for (i = 0; i < scores.achievementScores.length; i++) {
          if (scores.achievementScores[i] != newScores.achievementScores[i]) {
            callback('different');
            return;
          }
        }

        if (oldTournament) {
          for (i = 0; i < scores.tournamentScores.length; i++) {
          if ((scores.tournamentScores[i].name != newScores.tournamentScores[i].name)
              || (scores.tournamentScores[i].bankroll != newScores.tournamentScores[i].bankroll)) {
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
