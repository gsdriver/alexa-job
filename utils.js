//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});
const redis = require('redis');
const leaderBoard = redis.createClient({host: process.env.REDISHOST});

module.exports = {
  getAdSummary: function(data, adsPlayed) {
    let i;

    for (i = 0; i < data.Items.length; i++) {
      // Any ads played?
      if (data.Items[i].mapAttr && data.Items[i].mapAttr.M
              && data.Items[i].mapAttr.M.adsPlayed
              && data.Items[i].mapAttr.M.adsPlayed.M) {
        const ads = data.Items[i].mapAttr.M.adsPlayed.M;
        let ad;

        for (ad in ads) {
          if (adsPlayed[ad]) {
            adsPlayed[ad]++;
          } else {
            adsPlayed[ad] = 1;
          }
        }
      }
    }
  },
  getAdSummaryDoc: function(data, adsPlayed) {
    let i;

    for (i = 0; i < data.Items.length; i++) {
      // Any ads played?
      if (data.Items[i].mapAttr
              && data.Items[i].mapAttr.adsPlayed) {
        const ads = data.Items[i].mapAttr.adsPlayed;
        let ad;

        for (ad in ads) {
          if (adsPlayed[ad]) {
            adsPlayed[ad]++;
          } else {
            adsPlayed[ad] = 1;
          }
        }
      }
    }
  },
  getFirstPlayFromAds: function(ads) {
    // First play is based on oldest ad played
    let firstPlay;

    if (ads) {
      let ad;

      for (ad in ads) {
        if (!firstPlay || (ads[ad] < firstPlay)) {
          firstPlay = ads[ad];
        }
      }
    }

    return firstPlay;
  },
  getAdText: function(adsPlayed) {
    const tableStart = '<div class=Ads><table class=AdTable border=1 cellspacing=0 cellpadding=0 style=\'border-collapse:collapse;border:none;mso-border-alt:solid #A8D08D .5pt; mso-border-themecolor:accent6;mso-border-themetint:153;mso-yfti-tbllook:1184;mso-padding-alt:0in 5.4pt 0in 5.4pt\'><tr style=\'mso-yfti-irow:-1;mso-yfti-firstrow:yes;mso-yfti-lastfirstrow:yes\'><td width=144 valign=top style=\'width:107.75pt;border:solid #70AD47 1.0pt;mso-border-themecolor:accent6;border-right:none;mso-border-top-alt:solid #70AD47 .5pt;mso-border-top-themecolor:accent6;mso-border-left-alt:solid #70AD47 .5pt;mso-border-left-themecolor:accent6;mso-border-bottom-alt:solid #70AD47 .5pt;mso-border-bottom-themecolor:accent6;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'margin-bottom:0in;margin-bottom:.0001pt;line-height:normal;mso-yfti-cnfc:5\'><b><span style=\'color:white;mso-themecolor:background1\'>Ad<o:p></o:p></span></b></p></td><td width=258 valign=top style=\'width:193.5pt;border:solid #70AD47 1.0pt;mso-border-themecolor:accent6;border-left:none;mso-border-top-alt:solid #70AD47 .5pt;mso-border-top-themecolor:accent6;mso-border-bottom-alt:solid #70AD47 .5pt;mso-border-bottom-themecolor:accent6;mso-border-right-alt:solid #70AD47 .5pt;mso-border-right-themecolor:accent6;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'margin-bottom:0in;margin-bottom:.0001pt;line-height:normal;mso-yfti-cnfc:1\'><b><span style=\'color:white;mso-themecolor:background1\'>Impressions<o:p></o:p></span></b></p></td></tr>';
    const tableEnd = '</table><p class=MsoNormal><o:p>&nbsp;</o:p></p></div>';
    const rowFormat = ' <tr style=\'mso-yfti-irow:0\'><td width=144 valign=top style=\'width:107.75pt;border:solid #A8D08D 1.0pt;mso-border-themecolor:accent6;mso-border-themetint:153;border-top:none;mso-border-top-alt:solid #A8D08D .5pt;mso-border-top-themecolor:accent6;mso-border-top-themetint:153;mso-border-alt:solid #A8D08D .5pt;mso-border-themecolor:accent6;mso-border-themetint:153;background:#E2EFD9;mso-background-themecolor:accent6;mso-background-themetint:51;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'margin-bottom:0in;margin-bottom:.0001pt;line-height:normal;mso-yfti-cnfc:68\'><b>{0}<o:p></o:p></b></p></td><td width=258 valign=top style=\'width:193.5pt;border-top:none;border-left:none;border-bottom:solid #A8D08D 1.0pt;mso-border-bottom-themecolor:accent6;mso-border-bottom-themetint:153;border-right:solid #A8D08D 1.0pt;mso-border-right-themecolor:accent6;mso-border-right-themetint:153;mso-border-top-alt:solid #A8D08D .5pt;mso-border-top-themecolor:accent6;mso-border-top-themetint:153;mso-border-left-alt:solid #A8D08D .5pt;mso-border-left-themecolor:accent6;mso-border-left-themetint:153;mso-border-alt:solid #A8D08D .5pt;mso-border-themecolor:accent6;mso-border-themetint:153;background:#E2EFD9;mso-background-themecolor:accent6;mso-background-themetint:51;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'margin-bottom:0in;margin-bottom:.0001pt;line-height:normal;mso-yfti-cnfc:64\'>{1}</p></td></tr>';
    let htmlText;
    let tableRow;

    htmlText = tableStart;
    if (adsPlayed) {
      let ad;

      for (ad in adsPlayed) {
        if (ad) {
          tableRow = rowFormat.replace('{0}', ad).replace('{1}', adsPlayed[ad]);
          htmlText += tableRow;
        }
      }
    }
    htmlText += tableEnd;

    return htmlText;
  },
  getSummaryTable: function(game, rows) {
    const tableStart = '<div class=WordSection1><table class=MsoTable15Grid5DarkAccent6 border=1 cellspacing=0 cellpadding=0style=\'border-collapse:collapse;border:none;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;mso-yfti-tbllook:1184;mso-padding-alt:0in 5.4pt 0in 5.4pt\'><tr style=\'mso-yfti-irow:-1;mso-yfti-firstrow:yes;mso-yfti-lastfirstrow:yes\'><td width=401 colspan=2 valign=top style=\'width:301.1pt;border:solid white 1.0pt;mso-border-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:5\'><b><span style=\'color:white;mso-themecolor:background1\'>{0}</span></b><b style=\'mso-bidi-font-weight:normal\'><span style=\'color:white;mso-themecolor:background1\'><o:p></o:p></span></b></p></td></tr>';
    const tableEnd = '</table><p class=MsoNormal><o:p>&nbsp;</o:p></p></div>';
    let htmlText;

    htmlText = tableStart.replace('{0}', game);
    htmlText = rows.reduce((text, row) => (text + row), htmlText);
    htmlText += tableEnd;
    return htmlText;
  },
  getSummaryTableRow: function(firstColumn, secondColumn, formatting) {
    const rowFormat = '<tr style=\'mso-yfti-irow:0\'><td width=143 valign=top style=\'width:107.6pt;border:solid white 1.0pt;mso-border-themecolor:background1;border-top:none;mso-border-top-alt:solid white .5pt;mso-border-top-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:68\'><b><span style=\'color:white;mso-themecolor:background1\'>{0}<o:p></o:p></span></b></p></td><td width=258 valign=top style=\'width:193.5pt;border-top:none;border-left:none;border-bottom:solid white 1.0pt;mso-border-bottom-themecolor:background1;border-right:solid white 1.0pt;mso-border-right-themecolor:background1;mso-border-top-alt:solid white .5pt;mso-border-top-themecolor:background1;mso-border-left-alt:solid white .5pt;mso-border-left-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#C5E0B3;mso-background-themecolor:accent6;mso-background-themetint:102;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:64\'>{1}</p></td></tr>';
    let first = firstColumn;
    let second = secondColumn;

    if (formatting) {
      if (formatting.boldFirstColumn) {
        first = '<b>' + first + '</b>';
      }
      if (formatting.boldSecondColumn) {
        second = '<b>' + second + '</b>';
      }
    }
    return rowFormat.replace('{0}', first).replace('{1}', second);
  },
  saveNewUsers: function() {
    const now = Date.now();
    const details = {roulette: 0, blackjack: 0, slots: 0, poker: 0, craps: 0, timestamp: now};

    // Read from the databases
    dynamodb.getItem({TableName: 'RouletteWheel', Key: {userId: {S: 'game'}}},
            (err, data) => {
      if (data && data.Item && data.Item.newUsers) {
        details.roulette = parseInt(data.Item.newUsers.N);
        dynamodb.getItem({TableName: 'PlayBlackjack', Key: {userId: {S: 'game'}}},
                (err, data) => {
          if (data && data.Item && data.Item.newUsers) {
            details.blackjack = parseInt(data.Item.newUsers.N);
            dynamodb.getItem({TableName: 'Slots', Key: {userId: {S: 'game'}}},
                    (err, data) => {
              if (data && data.Item && data.Item.newUsers) {
                details.slots = parseInt(data.Item.newUsers.N);
                dynamodb.getItem({TableName: 'VideoPoker', Key: {userId: {S: 'game'}}},
                        (err, data) => {
                  if (data && data.Item && data.Item.newUsers) {
                    details.poker = parseInt(data.Item.newUsers.N);
                    dynamodb.getItem({TableName: 'Craps', Key: {userId: {S: 'game'}}},
                            (err, data) => {
                      if (data && data.Item && data.Item.newUsers) {
                        details.craps = parseInt(data.Item.newUsers.N);

                        // Now write to S3
                        const params = {Body: JSON.stringify(details),
                          Bucket: 'garrett-alexa-usage',
                          Key: 'newusers/' + now + '.txt'};

                        s3.putObject(params, (err, data) => {});

                        // And reset the DBs
                        dynamodb.putItem({TableName: 'RouletteWheel',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'PlayBlackjack',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'Slots',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'VideoPoker',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                        dynamodb.putItem({TableName: 'Craps',
                                      Item: {userId: {S: 'game'}, newUsers: {N: '0'}}},
                                      (err, data) => {});
                      }
                    });
                  }
                });
              }
            });
          }
        });
      }
    });
  },
  // Generates the text for blackjack e-mail summary
  getBounceResults: function(skill, callback) {
    let text;

    getLastStates(skill, (err, results, states) => {
      let result;

      if (states) {
        // First line, all the states
        let i;
        text = 'Date,';
        for (i = 0; i < states.length; i++) {
          text += states[i] + '%,';
        }
        text += ',';
        for (i = 0; i < states.length; i++) {
          text += states[i] + ',';
        }
        text += '\n';
        for (result in results) {
          if (result) {
            let state;
            let total = 0;

            // OK, let's write the results for this date
            text += getFormattedDate(new Date(parseInt(result))) + ',';
            for (state in results[result]) {
              if (state) {
                total += results[result][state];
              }
            }

            if (total) {
              states.forEach((state) => {
                if (results[result][state]) {
                  text += Math.round((1000 * results[result][state]) / total) / 10;
                }
                text += ',';
              });
            }

            text += ',';
            states.forEach((state) => {
              if (results[result][state]) {
                text += results[result][state];
              }
              text += ',';
            });
            text += '\n';
          }
        }
      }
      callback(text);
    });
  },
  getAchievementScore: function(game, attributes) {
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
  },
  clearLeaderBoard: function(game, subGame, callback) {
    let board = 'leaders-' + game;
    if (subGame) {
      board += ('-' + subGame);
    }

    leaderBoard.zremrangebyrank(board, 0, -1, callback);
  },
  rebuildLeaderBoards: function(callback) {
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
  },
};

function getLastStates(skill, callback) {
  const states = [];
  const results = {};

  AWS.config.update({region: 'us-east-1'});
  readS3Files('garrett-alexa-logs', 'sessions/' + skill + '/', null, (err, data) => {
    if (err) {
      callback(err);
    } else {
      data.forEach((result) => {
        // Read state
        if (result.state) {
          // Strip the date from the timestamp
          const fulldate = new Date(result.timestamp);
          const date = (new Date(fulldate.getFullYear(),
                fulldate.getMonth(), fulldate.getDate())).valueOf();
          if (!results[date]) {
            results[date] = {};
          }
          results[date][result.state] = (results[date][result.state] + 1) || 1;

          if (states.indexOf(result.state) === -1) {
            states.push(result.state);
          }
        }
      });

      callback(null, results, states);
    }
  });
}

// Read every file from an S3 bucket
function readS3Files(bucket, prefix, daterange, callback) {
  const results = [];
  let keysToProcess;

  // First get a full directory listing
  getKeyList(bucket, prefix, (err, keyList) => {
    if (err) {
      callback(err);
    } else if (keyList.length === 0) {
      callback('no results');
    } else {
      keysToProcess = keyList.length;
      (function processFiles(keyList) {
        if (keyList.length === 0) {
          // All done!
          return;
        }

        const key = keyList.pop();
        const timestamp = parseInt(key.replace(prefix, '').replace('.txt', ''));
        if (!daterange ||
            (!((daterange.start && (timestamp <= daterange.start)) ||
              (daterange.end && (timestamp >= daterange.end))))) {
          // In the date range, so download from S3
          s3.getObject({Bucket: bucket, Key: key},
            function(err, data) {
              if (err) {
                // Oops, just abort the whole thing
                callback(err);
              } else {
                // OK, let's read this in and split into an array
                try {
                  const text = data.Body.toString('ascii');
                  const log = JSON.parse(text);
                  log.timestamp = this.timestamp;
                  results.push(log);
                } catch(e) {
                  console.log(e.name);
                }

                // Is that it?
                if (--keysToProcess === 0) {
                  // Sort by timestamp
                  results.sort((a, b) => b.timestamp - a.timestamp);
                  callback(null, results);
                }
              }
            }.bind({timestamp: timestamp}));
        } else if (--keysToProcess === 0) {
          // We're done
          results.sort((a, b) => b.timestamp - a.timestamp);
          callback(null, results);
        }

        processFiles(keyList);
      })(keyList);
    }
  });
}

function getKeyList(bucket, prefix, callback) {
  const keyList = [];

  // Loop thru to read in all keys
  (function loop(firstRun, token) {
    const params = {Bucket: bucket};
    if (prefix) {
      params.Prefix = prefix;
    }

    if (firstRun || token) {
      params.ContinuationToken = token;

      const listObjectPromise = s3.listObjectsV2(params).promise();
      return listObjectPromise.then((data) => {
        let i;

        for (i = 0; i < data.Contents.length; i++) {
          keyList.push(data.Contents[i].Key);
        }
        if (data.NextContinuationToken) {
          return loop(false, data.NextContinuationToken);
        }
      });
    }
  })(true, null).then(() => {
    // Success - now parse these into stories
    callback(null, keyList);
  }).catch((err) => {
    callback(err);
  });
}

function getFormattedDate(date) {
  const year = date.getFullYear();
  const month = (1 + date.getMonth()).toString();
  const day = date.getDate().toString();

  return month + '/' + day + '/' + year;
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
              const achievementScore = module.exports.getAchievementScore(game, item.mapAttr);
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
