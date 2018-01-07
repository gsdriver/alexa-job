//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const redis = require('redis');
const leaderBoard = redis.createClient({host: process.env.REDISHOST});

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('Leaderboards triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  rebuildLeaderBoards(() => {
    // Close redis connection and callback
    console.log('Done!');
    leaderBoard.quit();
    callback();
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

  // We will rebuild
  for (game in gameDatabases) {
    if (gameDatabases[game]) {
      numCalls++;
      populateLeaderBoardFromDB(game, gameDatabases[game], (err) => {
        if (--numCalls === 0) {
          callback();
        }
      });
    }
  }
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
    processDBEntries(dbName,
      (item) => {
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
      },
      (err, results) => {
        callback(err);
      }
    );
  }
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
           const entry = callback(data.Items[i]);
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
