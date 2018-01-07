//
// Utility functions
//

'use strict';

const AWS = require('aws-sdk');
AWS.config.update({
  accessKeyId: process.env.accessKeyId,
  secretAccessKey: process.env.secretAccessKey,
  region: 'us-east-1',
});
const SES = new AWS.SES();
const doc = new AWS.DynamoDB.DocumentClient({apiVersion: '2012-08-10'});

const ONEDAY = 24*60*60*1000;

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('Send mail triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  getMailText((mailBody) => {
    sendEmail(mailBody, (err, data) => {
      if (err) {
        console.log('Error sending mail ' + err.stack);
        callback(err);
      } else {
        console.log('Mail sent!');
        callback();
      }
    });
  });
};

function getMailText(callback) {
  let toRun = 5;
  let bjText;
  let slotText;
  let rouletteText;
  let pokerText;
  let crapsText;

  getBlackjackMail((text) => {
    bjText = text;
    completed();
  });

  getRouletteMail((text) => {
    rouletteText = text;
    completed();
  });

  getSlotsMail((text) => {
    slotText = text;
    completed();
  });

  getPokerMail((text) => {
    pokerText = text;
    completed();
  });

  getCrapsMail((text) => {
    crapsText = text;
    completed();
  });

  function completed() {
    toRun--;
    if (toRun === 0) {
      const mailBody = '<HTML>' + bjText + rouletteText + slotText + pokerText + crapsText + '</HTML>';
      callback(mailBody);
    }
  }
}

function getBlackjackMail(callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  let recentPlayers = 0;
  let totalPlayers = 0;

  processDBEntries('PlayBlackjack',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      players[attributes.playerLocale] = (players[attributes.playerLocale] + 1) || 1;
      if (attributes.standard && attributes.standard.timestamp
        && (now - attributes.standard.timestamp < ONEDAY)) {
        recentPlayers++;
      } else if (attributes.tournament && attributes.tournament.timestamp
        && (now - attributes.tournament.timestamp < ONEDAY)) {
        recentPlayers++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting blackjack data: ' + err);
    } else {
      // Get the progressive information for standard
      getBlackjackProgressive('standard', (game, progressiveHands, jackpots) => {
        const rows = [];

        rows.push(getSummaryTableRow('Total Players', totalPlayers));
        rows.push(getSummaryTableRow('Past 24 Hours', recentPlayers, {boldSecondColumn: true}));
        rows.push(getSummaryTableRow('American Players', players['en-US']));
        rows.push(getSummaryTableRow('UK Players', players['en-GB']));
        rows.push(getSummaryTableRow('Canadian Players', players['en-CA'] ? players['en-CA'] : 0));
        rows.push(getSummaryTableRow('Indian Players', players['en-IN'] ? players['en-IN'] : 0));
        rows.push(getSummaryTableRow('Progressive Hands', progressiveHands));

        text = getSummaryTable('BLACKJACK', rows);
        text += getAdText(adsPlayed);
        callback(text);
      });
    }
  });
}

function getRouletteMail(callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  let totalPlayers = 0;
  const american = {players: 0, recent: 0};
  const european = {players: 0, recent: 0};

  processDBEntries('RouletteWheel',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      players[attributes.playerLocale] = (players[attributes.playerLocale] + 1) || 1;
      if (attributes.american) {
        const game = attributes.american;
        if (game.spins) {
          american.players++;
        }
        if (game.timestamp &&
          (now - game.timestamp < ONEDAY)) {
          american.recent++;
        }
      }
      if (attributes.european) {
        const game = attributes.european;
        if (game.spins) {
          european.players++;
        }
        if (game.timestamp &&
          (now - game.timestamp < ONEDAY)) {
          european.recent++;
        }
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting roulette data: ' + err);
    } else {
      const rows = [];

      rows.push(getSummaryTableRow('Total Players', totalPlayers));
      rows.push(getSummaryTableRow('American Players', players['en-US']));
      rows.push(getSummaryTableRow('UK Players', players['en-GB']));
      rows.push(getSummaryTableRow('Canadian Players', players['en-CA'] ? players['en-CA'] : 0));
      rows.push(getSummaryTableRow('Indian Players', players['en-IN'] ? players['en-IN'] : 0));
      rows.push(getSummaryTableRow('Australian Players', players['en-AU'] ? players['en-AU'] : 0));
      rows.push(getSummaryTableRow('American Wheel Players', american.players));
      rows.push(getSummaryTableRow('Past 24 Hours', american.recent, {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('European Wheel Players', european.players));
      rows.push(getSummaryTableRow('Past 24 Hours', european.recent, {boldSecondColumn: true}));

      text = getSummaryTable('ROULETTE', rows);
      text += getAdText(adsPlayed);
      callback(text);
    }
  });
}

function getSlotsMail(callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  const games = {};
  let totalPlayers = 0;
  let numGames = 0;
  let game;

  processDBEntries('Slots',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      players[attributes.playerLocale] = (players[attributes.playerLocale] + 1) || 1;
      for (game in attributes) {
        if (game && (attributes[game].spins)) {
          if (!games[game]) {
            games[game] = {};
            numGames++;
          }
          games[game].players = (games[game].players + 1) || 1;

          if (attributes[game].timestamp &&
            (now - attributes[game].timestamp < ONEDAY)) {
            games[game].recent = (games[game].recent + 1) || 1;
          }
        }
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      const rows = [];
      let readGames = 0;

      rows.push(getSummaryTableRow('Total Players', totalPlayers));
      rows.push(getSummaryTableRow('American Players', players['en-US']));
      rows.push(getSummaryTableRow('UK Players', players['en-GB']));
      rows.push(getSummaryTableRow('Canadian Players', players['en-CA'] ? players['en-CA'] : 0));
      rows.push(getSummaryTableRow('Indian Players', players['en-IN'] ? players['en-IN'] : 0));
      rows.push(getSummaryTableRow('Australian Players', players['en-AU'] ? players['en-AU'] : 0));

      for (game in games) {
        if (game) {
          getSlotsProgressive(game, (game, coins) => {
            rows.push(getSummaryTableRow('Total ' + game + ' Players', games[game].players));
            rows.push(getSummaryTableRow('Past 24 Hours', games[game].recent, {boldSecondColumn: true}));
            if (coins && (coins > 0)) {
              rows.push(getSummaryTableRow('Progressive Coins', coins));
            }

            // Are we done?
            readGames++;
            if (readGames === numGames) {
              text = getSummaryTable('SLOT MACHINE', rows);
              text += getAdText(adsPlayed);
              callback(text);
            }
          });
        }
      }
    }
  });
}

function getPokerMail(callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const games = {};
  let totalPlayers = 0;
  let numGames = 0;
  let game;

  processDBEntries('VideoPoker',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      for (game in attributes) {
        if (game && (attributes[game].spins)) {
          if (!games[game]) {
            games[game] = {};
            numGames++;
          }
          games[game].players = (games[game].players + 1) || 1;

          if (attributes[game].timestamp &&
            (now - attributes[game].timestamp < ONEDAY)) {
            games[game].recent = (games[game].recent + 1) || 1;
          }
        }
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      const rows = [];
      let readGames = 0;

      rows.push(getSummaryTableRow('Total Players', totalPlayers));
      for (game in games) {
        if (game) {
          getPokerProgressive(game, (game, coins) => {
            rows.push(getSummaryTableRow('Total ' + game + ' Players', games[game].players));
            rows.push(getSummaryTableRow('Past 24 Hours', games[game].recent, {boldSecondColumn: true}));
            if (coins && (coins > 0)) {
              rows.push(getSummaryTableRow('Progressive Coins', coins));
            }

            // Are we done?
            readGames++;
            if (readGames === numGames) {
              text = getSummaryTable('VIDEO POKER', rows);
              text += getAdText(adsPlayed);
              callback(text);
            }
          });
        }
      }
    }
  });
}

function getCrapsMail(callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  let totalPlayers = 0;
  let recent = 0;
  let rounds = 0;

  processDBEntries('Craps',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      if (attributes.basic && attributes.basic.timestamp &&
        (now - attributes.basic.timestamp < ONEDAY)) {
        recent++;
      }
      if (attributes.basic && attributes.basic.rounds) {
        rounds += attributes.basic.rounds;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      const rows = [];
      rows.push(getSummaryTableRow('Total Players', totalPlayers));
      rows.push(getSummaryTableRow('Past 24 Hours', recent, {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('Rounds Played', rounds));
      text = getSummaryTable('CRAPS', rows);
      text += getAdText(adsPlayed);
      callback(text);
    }
  });
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
           const entry = callback(data.Items[i].mapAttr);
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

function getBlackjackProgressive(game, callback) {
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

function getSlotsProgressive(game, callback) {
  // Read from database
  doc.get({TableName: 'Slots', Key: {userId: 'game-' + game}},
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

function getPokerProgressive(game, callback) {
  // Read from database
  doc.get({TableName: 'VideoPoker', Key: {userId: 'game-' + game}},
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

function countAds(attributes, adsPlayed) {
  if (attributes.adsPlayed) {
    let ad;
    for (ad in attributes.adsPlayed) {
      if (ad) {
        adsPlayed[ad] = (adsPlayed[ad] + 1) || 1;
      }
    }
  }
}

function sendEmail(text, callback) {
  const d = new Date();
  d.setHours(d.getHours() - 8);

  const digestName = (d.getHours() < 12)
          ? 'Alexa Skill Usage Morning Digest'
          : 'Alexa Skill Usage Evening Digest';

  const params = {
    Destination: {
      ToAddresses: [
        process.env.MAILTO,
      ],
    },
    Message: {
      Body: {
        Html: {
          Data: text,
          Charset: 'UTF-8',
        },
      },
      Subject: {
        Data: digestName,
        Charset: 'UTF-8',
      },
    },
    Source: process.env.MAILFROM,
  };

  SES.sendEmail(params, callback);
}

function getSummaryTable(game, rows) {
  const tableStart = '<div class=WordSection1><table class=MsoTable15Grid5DarkAccent6 border=1 cellspacing=0 cellpadding=0style=\'border-collapse:collapse;border:none;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;mso-yfti-tbllook:1184;mso-padding-alt:0in 5.4pt 0in 5.4pt\'><tr style=\'mso-yfti-irow:-1;mso-yfti-firstrow:yes;mso-yfti-lastfirstrow:yes\'><td width=401 colspan=2 valign=top style=\'width:301.1pt;border:solid white 1.0pt;mso-border-themecolor:background1;mso-border-alt:solid white .5pt;mso-border-themecolor:background1;background:#70AD47;mso-background-themecolor:accent6;padding:0in 5.4pt 0in 5.4pt\'><p class=MsoNormal style=\'mso-yfti-cnfc:5\'><b><span style=\'color:white;mso-themecolor:background1\'>{0}</span></b><b style=\'mso-bidi-font-weight:normal\'><span style=\'color:white;mso-themecolor:background1\'><o:p></o:p></span></b></p></td></tr>';
  const tableEnd = '</table><p class=MsoNormal><o:p>&nbsp;</o:p></p></div>';
  let htmlText;

  htmlText = tableStart.replace('{0}', game);
  htmlText = rows.reduce((text, row) => (text + row), htmlText);
  htmlText += tableEnd;
  return htmlText;
}

function getSummaryTableRow(firstColumn, secondColumn, formatting) {
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
}

function getAdText(adsPlayed) {
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
}
