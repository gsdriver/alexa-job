//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({region: 'us-east-1'});
const dynamodb = new AWS.DynamoDB({apiVersion: '2012-08-10'});
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

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
  getSummaryTableRow: function(firstColumn, secondColumn) {
    const rowFormat = '<tr style=\'mso-yfti-irow:0\'><td width=143 valign=top style=\'width:107.6pt;border:solid white 1.0pt;mso-border-themecolor:background1;border-top:none;mso-border-top-alt:solid white .5pt;mso-border-top-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:68\'><b><span style=\'color:white;mso-themecolor:background1\'>{0}<o:p></o:p></span></b></p></td><td width=258 valign=top style=\'width:193.5pt;border-top:none;border-left:none;border-bottom:solid white 1.0pt;mso-border-bottom-themecolor:background1;border-right:solid white 1.0pt;mso-border-right-themecolor:background1;mso-border-top-alt:solid white .5pt;mso-border-top-themecolor:background1;mso-border-left-alt:solid white .5pt;mso-border-left-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#C5E0B3;mso-background-themecolor:accent6;mso-background-themetint:102;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:64\'>{1}</p></td></tr>';

    return rowFormat.replace('{0}', firstColumn).replace('{1}', secondColumn);
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
