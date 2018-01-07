//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const redis = require('redis');
let leaderBoard;

exports.handler = function(event, context) {
  rebuildLeaderBoards((err, timestamp) => {
    if (err) {
      console.log('Error writing boards');
      context.fail(err);
    } else {
      if (timestamp) {
        console.log('Wrote leader boards at ' + timestamp);
      }
      context.succeed();
    }
  });
};

function rebuildLeaderBoards(callback) {
  const gameDatabases = {
    'blackjack': 'PlayBlackjack',
    'slots': 'Slots',
    'roulette': 'RouletteWheel',
    'videopoker': 'VideoPoker',
    'craps': 'Craps',
  };
  let numCalls = 0;
  let game;

  // First check the rebuild file to see if we should rebuild
  // We rebuild once a week - so if the current time is more than
  // a week from the last rebuild, then build now
  s3.getObject({Bucket: 'garrett-alexa-usage', Key: 'LeaderBoardBuild.txt'}, (err, data) => {
    if (err) {
      callback(err);
    } else {
      const build = JSON.parse(data.Body.toString('ascii'));
      if ((build.timestamp === undefined) && (build.force === undefined)) {
        callback('No timestamp in build file');
      } else {
        let now = Date.now();

        if (build.force || (now - build.timestamp > 7*24*60*60*1000)) {
          // Connect to redis
          leaderBoard = redis.createClient({host: process.env.REDISHOST});

          // We will rebuild
          for (game in gameDatabases) {
            if (gameDatabases[game]) {
              numCalls++;
              populateLeaderBoardFromDB(game, gameDatabases[game], (err) => {
                if (--numCalls === 0) {
                  completed();
                }
              });
            }
          }

          function completed() {
            // Close redis connection
            leaderBoard.quit();

            // Write out that we built - only change timestamp if we weren't forced to run
            if (build.force) {
              now = build.timestamp;
            }

            const params = {Body: JSON.stringify({timestamp: now}),
              Bucket: 'garrett-alexa-usage',
              Key: 'LeaderBoardBuild.txt'};

            s3.putObject(params, (err, data) => {
              if (callback) {
                callback(null, now);
              }
            });
          }
        } else {
          // No error - no need to write
          callback(null, 0);
        }
      }
    }
  });
}

// Populates the leader board of a game from the DB
function populateLeaderBoardFromDB(game, dbName, callback) {
  // First clear the caches
  if (game === 'videopoker') {
    leaderBoard.zremrangebyrank('leaders-videopoker-jacks', 0, -1, (err) => {
      leaderBoard.zremrangebyrank('leaders-videopoker-deueces', 0, -1, (err) => {
        cleared();
      });
    });
  } else if (game === 'craps') {
    leaderBoard.zremrangebyrank('leaders-craps-basic', 0, -1, (err) => {
      cleared();
    });
  } else if (game === 'slots') {
    leaderBoard.zremrangebyrank('leaders-slots', 0, -1, (err) => {
      leaderBoard.zremrangebyrank('leaders-slots-wild', 0, -1, (err) => {
        leaderBoard.zremrangebyrank('leaders-slots-progressive', 0, -1, (err) => {
          leaderBoard.zremrangebyrank('leaders-slots-basic', 0, -1, (err) => {
            leaderBoard.zremrangebyrank('leaders-slots-loose', 0, -1, (err) => {
              cleared();
            });
          });
        });
      });
    });
  } else {
    leaderBoard.zremrangebyrank('leaders-' + game, 0, -1, (err) => {
      cleared();
    });
  }

  function cleared() {
    // Loop thru to read in all items from the DB
    (function loop(firstRun, startKey) {
      const params = {TableName: dbName};

      if (firstRun || startKey) {
        params.ExclusiveStartKey = startKey;

        const scanPromise = doc.scan(params).promise();
        return scanPromise.then((data) => {
          data.Items.forEach((item) => {
            if (item.mapAttr) {
              const achievementScore = getAchievementScore(game, item.mapAttr);
              if (achievementScore !== undefined) {
                leaderBoard.zadd('leaders-' + game, achievementScore, item.userId);
              }

              // For video poker and slots, add for each game
              if ((game === 'videopoker') || (game === 'slots')) {
                let subGame;

                for (subGame in item.mapAttr) {
                  if (item.mapAttr[subGame] && item.mapAttr[subGame].spins
                    && item.mapAttr[subGame].bankroll) {
                    leaderBoard.zadd('leaders-' + game + '-' + subGame, item.mapAttr[subGame].bankroll, item.userId);
                  }
                }
              } else if (game === 'craps') {
                // For craps, add for basic if they haven't played
                if (item.mapAttr.basic.rounds || (item.mapAttr.basic.bankroll !== 1000)) {
                  if (item.mapAttr.basic.bankroll) {
                    leaderBoard.zadd('leaders-craps-basic', item.mapAttr.basic.bankroll, item.userId);
                  }
                }
              }
            }
          });

          if (data.LastEvaluatedKey) {
            return loop(false, data.LastEvaluatedKey);
          }
        });
      }
    })(true, null).then(() => {
      callback(null);
    }).catch((err) => {
      console.log('Error populating ' + game + ' leaderboard: ' + err);
      callback(err), null;
    });
  }
}

function getAchievementScore(game, attributes) {
  let achievementScore;
  const achievements = (attributes) ? attributes.achievements : undefined;

  if (game === 'slots') {
    achievementScore = 0;
    if (achievements) {
      if (achievements.gamedaysPlayed) {
        achievementScore += 10 * achievements.gamedaysPlayed;
      }
      if (achievements.jackpot) {
        achievementScore += 25 * achievements.jackpot;
      }
      if (achievements.streakScore) {
        achievementScore += achievements.streakScore;
      }
    }
  } else if (game === 'blackjack') {
    achievementScore = 0;
    if (achievements) {
      if (achievements.trophy) {
        achievementScore += 100 * parseInt(achievements.trophy);
      }
      if (achievements.daysPlayed) {
        achievementScore += 10 * parseInt(achievements.daysPlayed);
      }
      if (achievements.naturals) {
        achievementScore += 5 * parseInt(achievements.naturals);
      }
      if (achievements.streakScore) {
        achievementScore += parseInt(achievements.streakScore);
      }
    }
  } else if (game === 'roulette') {
    achievementScore = 0;
    if (achievements) {
      if (achievements.trophy) {
        achievementScore += 100 * parseInt(achievements.trophy);
      }
      if (achievements.daysPlayed) {
        achievementScore += 10 * parseInt(achievements.daysPlayed);
      }
      if (achievements.streakScore) {
        achievementScore += parseInt(achievements.streakScore);
      }
    }
  }

  return achievementScore;
}
