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
const s3 = new AWS.S3({apiVersion: '2006-03-01'});

const ONEDAY = 24*60*60*1000;

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('Send mail triggered by ' + event.Records[0].s3.object.key);
    }
  }
  context.callbackWaitsForEmptyEventLoop = false;

  getMailText((mailBody, summary) => {
    sendEmail(mailBody, (err, data) => {
      if (err) {
        console.log('Error sending mail ' + err.stack);
        callback(err);
      } else {
        console.log('Mail sent!');

        // And write the summary out to S3
        const today = new Date();
        today.setDate(today.getDate() - 1);
        const params = {Body: JSON.stringify(summary),
          Bucket: 'garrett-alexa-usage',
          Key: 'dailysummary/' + getFormattedDate(today, '-') + '.txt'};
        s3.putObject(params, (err, data) => {
          if (err) {
            console.log('Error writing to S3 ' + err.stack);
          }
          callback();
        });
      }
    });
  });
};

function getMailText(callback) {
  let toRun = 7;
  let bjText;
  let slotText;
  let rouletteText;
  let pokerText;
  let crapsText;
  let warText;
  let baccaratText;
  const summary = {};

  // Before we do anything, we need to read in yesterday's results
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 2);

  s3.getObject({Bucket: 'garrett-alexa-usage',
      Key: 'dailysummary/' + getFormattedDate(yesterday, '-') + '.txt'},
      (err, data) => {
    let lastRun;

    if (data) {
      const text = data.Body.toString('ascii');
      lastRun = JSON.parse(text);
    } else {
      lastRun = {};
    }

    getBlackjackMail(lastRun.blackjack, (text, details) => {
      bjText = text;
      summary.blackjack = details;
      completed();
    });

    getRouletteMail(lastRun.roulette, (text, details) => {
      rouletteText = text;
      summary.roulette = details;
      completed();
    });

    getSlotsMail(lastRun.slots, (text, details) => {
      slotText = text;
      summary.slots = details;
      completed();
    });

    getPokerMail(lastRun.poker, (text, details) => {
      pokerText = text;
      summary.poker = details;
      completed();
    });

    getCrapsMail(lastRun.craps, (text, details) => {
      crapsText = text;
      summary.craps = details;
      completed();
    });

    getWarMail(lastRun.war, (text, details) => {
      warText = text;
      summary.war = details;
      completed();
    });

    getBaccaratMail(lastRun.baccarat, (text, details) => {
      baccaratText = text;
      summary.baccarat = details;
      completed();
    });

    function completed() {
      toRun--;
      if (toRun === 0) {
        const mailBody = '<HTML>' + bjText + rouletteText + slotText + pokerText + crapsText + warText + baccaratText + '</HTML>';
        callback(mailBody, summary);
      }
    }
  });
}

function getBlackjackMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  let recentPlayers = 0;
  let totalPlayers = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});
  let trainingPlayers = 0;
  let displayDevices = 0;

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
      if (attributes.standard && attributes.standard.training) {
        trainingPlayers++;
      } else if (attributes.tournament && attributes.tournament.training) {
        trainingPlayers++;
      }
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting blackjack data: ' + err);
    } else {
      // Get the progressive information for standard
      getBlackjackProgressive('standard', (game, progressiveHands, jackpots) => {
        const rows = [];

        // Build up the JSON details
        details.totalPlayers = totalPlayers;
        details.recentPlayers = recentPlayers;
        details.players = players;
        details.trainingPlayers = trainingPlayers;
        details.progressiveHands = progressiveHands;
        details.displayDevices = displayDevices;

        rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
        rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(recentPlayers, lastRun.recentPlayers), {boldSecondColumn: true}));
        rows.push(getSummaryTableRow('American Players', deltaValue(players['en-US'],
          (lastRun.players) ? lastRun.players['en-US'] : undefined)));
        rows.push(getSummaryTableRow('UK Players', deltaValue(players['en-GB'],
          (lastRun.players) ? lastRun.players['en-GB'] : undefined)));
        rows.push(getSummaryTableRow('Canadian Players', deltaValue(players['en-CA'],
          (lastRun.players) ? lastRun.players['en-CA'] : undefined)));
        rows.push(getSummaryTableRow('Indian Players', deltaValue(players['en-IN'],
          (lastRun.players) ? lastRun.players['en-IN'] : undefined)));
        rows.push(getSummaryTableRow('Australian Players', deltaValue(players['en-AU'],
          (lastRun.players) ? lastRun.players['en-AU'] : undefined)));
        rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
        rows.push(getSummaryTableRow('Training Players', deltaValue(trainingPlayers, lastRun.trainingPlayers)));
        rows.push(getSummaryTableRow('Progressive Hands', deltaValue(progressiveHands, lastRun.progressiveHands)));

        text = getSummaryTable('BLACKJACK', rows);
        text += getAdText(adsPlayed);
        callback(text, details);
      });
    }
  });
}

function getRouletteMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  let totalPlayers = 0;
  const american = {players: 0, recent: 0};
  const european = {players: 0, recent: 0};
  let displayDevices = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});

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
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting roulette data: ' + err);
    } else {
      const rows = [];

      // Save JSON details
      details.totalPlayers = totalPlayers;
      details.players = players;
      details.displayDevices = displayDevices;
      details.american = american;
      details.european = european;

      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      rows.push(getSummaryTableRow('American Players', deltaValue(players['en-US'],
        (lastRun.players) ? lastRun.players['en-US'] : undefined)));
      rows.push(getSummaryTableRow('UK Players', deltaValue(players['en-GB'],
        (lastRun.players) ? lastRun.players['en-GB'] : undefined)));
      rows.push(getSummaryTableRow('Canadian Players', deltaValue(players['en-CA'],
        (lastRun.players) ? lastRun.players['en-CA'] : undefined)));
      rows.push(getSummaryTableRow('Indian Players', deltaValue(players['en-IN'],
        (lastRun.players) ? lastRun.players['en-IN'] : undefined)));
      rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
      rows.push(getSummaryTableRow('American Wheel Players', deltaValue(american.players,
        (lastRun.american) ? lastRun.american.players : undefined)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(american.recent,
        (lastRun.american) ? lastRun.american.recent : undefined),
        {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('European Wheel Players', deltaValue(european.players,
        (lastRun.european) ? lastRun.european.players : undefined)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(european.recent,
        (lastRun.european) ? lastRun.european.recent : undefined),
        {boldSecondColumn: true}));

      text = getSummaryTable('ROULETTE', rows);
      text += getAdText(adsPlayed);
      callback(text, details);
    }
  });
}

function getSlotsMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const players = {};
  const games = {};
  let totalPlayers = 0;
  let recentPlayers = 0;
  let numGames = 0;
  let game;
  let isRecent;
  let displayDevices = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});

  processDBEntries('Slots',
    (attributes) => {
      countAds(attributes, adsPlayed);
      totalPlayers++;
      isRecent = false;
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
            isRecent = true;
          }
        }
      }
      if (attributes.display) {
        displayDevices++;
      }
      if (isRecent) {
        recentPlayers++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      const rows = [];
      let readGames = 0;

      // Build up the details
      details.totalPlayers = totalPlayers;
      details.displayDevices = displayDevices;
      details.players = players;
      details.recentPlayers = recentPlayers;
      details.games = {};

      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(recentPlayers, lastRun.recentPlayers),
        {boldSecondColumn: true}));

      rows.push(getSummaryTableRow('American Players', deltaValue(players['en-US'],
        (lastRun.players) ? lastRun.players['en-US'] : undefined)));
      rows.push(getSummaryTableRow('UK Players', deltaValue(players['en-GB'],
        (lastRun.players) ? lastRun.players['en-GB'] : undefined)));
      rows.push(getSummaryTableRow('Canadian Players', deltaValue(players['en-CA'],
        (lastRun.players) ? lastRun.players['en-CA'] : undefined)));
      rows.push(getSummaryTableRow('Indian Players', deltaValue(players['en-IN'],
        (lastRun.players) ? lastRun.players['en-IN'] : undefined)));
      rows.push(getSummaryTableRow('Australian Players', deltaValue(players['en-AU'],
        (lastRun.players) ? lastRun.players['en-AU'] : undefined)));

      for (game in games) {
        if (game) {
          getSlotsProgressive(game, (game, coins) => {
            details.games[game] = games[game];

            rows.push(getSummaryTableRow('Total ' + game + ' Players', deltaValue(games[game].players,
              (lastRun.games && lastRun.games[game]) ? lastRun.games[game].players : undefined)));
            rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(games[game].recent,
              (lastRun.games && lastRun.games[game]) ? lastRun.games[game].recent : undefined),
              {boldSecondColumn: true}));
            if (coins && (coins > 0)) {
              details.games[game].coins = coins;
              rows.push(getSummaryTableRow('Progressive Coins', deltaValue(coins,
                (lastRun.games && lastRun.games[game]) ? lastRun.games[game].coins : undefined)));
            }

            // Are we done?
            readGames++;
            if (readGames === numGames) {
              rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
              text = getSummaryTable('SLOT MACHINE', rows);
              text += getAdText(adsPlayed);
              callback(text, details);
            }
          });
        }
      }
    }
  });
}

function getPokerMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  const games = {};
  let totalPlayers = 0;
  let numGames = 0;
  let displayDevices = 0;
  let game;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});

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
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      const rows = [];
      let readGames = 0;

      // Build JSON details
      details.totalPlayers = totalPlayers;
      details.displayDevices = displayDevices;
      details.games = {};

      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      for (game in games) {
        if (game) {
          getPokerProgressive(game, (game, coins) => {
            details.games[game] = games[game];

            rows.push(getSummaryTableRow('Total ' + game + ' Players', deltaValue(games[game].players,
              (lastRun.games && lastRun.games[game]) ? lastRun.games[game].players : undefined)));
            rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(games[game].recent,
              (lastRun.games && lastRun.games[game]) ? lastRun.games[game].recent : undefined),
              {boldSecondColumn: true}));
            if (coins && (coins > 0)) {
              details.games[game].coins = coins;
              rows.push(getSummaryTableRow('Progressive Coins', deltaValue(coins,
                (lastRun.games && lastRun.games[game]) ? lastRun.games[game].coins : undefined)));
            }

            // Are we done?
            readGames++;
            if (readGames === numGames) {
              rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
              text = getSummaryTable('VIDEO POKER', rows);
              text += getAdText(adsPlayed);
              callback(text, details);
            }
          });
        }
      }
    }
  });
}

function getCrapsMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  let totalPlayers = 0;
  let recent = 0;
  let rounds = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});
  let displayDevices = 0;

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
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting slots data: ' + err);
    } else {
      // Build JSON details
      details.totalPlayers = totalPlayers;
      details.displayDevices = displayDevices;
      details.recent = recent;
      details.rounds = rounds;

      const rows = [];
      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(recent, lastRun.recent), {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('Rounds Played', deltaValue(rounds, lastRun.rounds)));
      rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
      text = getSummaryTable('CRAPS', rows);
      text += getAdText(adsPlayed);
      callback(text, details);
    }
  });
}

function getWarMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  let totalPlayers = 0;
  let recent = 0;
  let rounds = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});
  let displayDevices = 0;

  processDBEntries('War',
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
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting war data: ' + err);
    } else {
      // Build JSON details
      details.totalPlayers = totalPlayers;
      details.displayDevices = displayDevices;
      details.recent = recent;
      details.rounds = rounds;

      const rows = [];
      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(recent, lastRun.recent), {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('Rounds Played', deltaValue(rounds, lastRun.rounds)));
      rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
      text = getSummaryTable('WAR', rows);
      text += getAdText(adsPlayed);
      callback(text, details);
    }
  });
}

function getBaccaratMail(previousDay, callback) {
  let text;
  const adsPlayed = [];
  const now = Date.now();
  let totalPlayers = 0;
  let recent = 0;
  let rounds = 0;
  const details = {};
  const lastRun = (previousDay ? previousDay : {});
  let displayDevices = 0;
  let maxMartini = 0;

  processDBEntries('Baccarat',
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
      if (attributes.maxMartini && (attributes.maxMartini > maxMartini)) {
        maxMartini = attributes.maxMartini;
      }
      if (attributes.display) {
        displayDevices++;
      }
    },
    (err, results) => {
    if (err) {
      callback('Error getting baccarat data: ' + err);
    } else {
      // Build JSON details
      details.totalPlayers = totalPlayers;
      details.displayDevices = displayDevices;
      details.recent = recent;
      details.rounds = rounds;
      details.maxMartini = maxMartini;

      const rows = [];
      rows.push(getSummaryTableRow('Total Players', deltaValue(totalPlayers, lastRun.totalPlayers)));
      rows.push(getSummaryTableRow('Past 24 Hours', deltaValue(recent, lastRun.recent), {boldSecondColumn: true}));
      rows.push(getSummaryTableRow('Rounds Played', deltaValue(rounds, lastRun.rounds)));
      rows.push(getSummaryTableRow('Display Devices', deltaValue(displayDevices, lastRun.displayDevices)));
      rows.push(getSummaryTableRow('Biggest Drinker', deltaValue(maxMartini, lastRun.maxMartini)));
      text = getSummaryTable('BACCARAT', rows);
      text += getAdText(adsPlayed);
      callback(text, details);
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
  const today = new Date();
  today.setDate(today.getDate() - 1);
  const digestName = 'Alexa Skill Usage Digest for ' + getFormattedDate(today);

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

  // If second column is "undefined" make it 0
  if (second === undefined) {
    second = 0;
  }

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

function getFormattedDate(date, hypen) {
  const year = date.getFullYear();
  const month = (1 + date.getMonth()).toString();
  const day = date.getDate().toString();
  const separator = (hypen) ? hypen : '/';

  return month + separator + day + separator + year;
}

function deltaValue(newvalue, oldvalue) {
  const value = (newvalue === undefined) ? 0 : newvalue;
  if (oldvalue === undefined) {
    return value;
  }

  const delta = value - oldvalue;

  if (delta == 0) {
    return value + ' (unchanged)';
  } else if (delta < 0) {
    return value + ' (<font color=red>down ' + (-delta) + '</font>)';
  } else {
    return value + ' (<font color=green>up ' + delta + '</font>)';
  }
}
