//
// Lambda function to update leader boards
//

'use strict';

const request = require('request');

exports.handler = function(event, context, callback) {
  // Note if this is triggered by an s3 upload
  if (event.Records && (event.Records.length > 0)) {
    if (event.Records[0].s3 && event.Records[0].s3.object) {
      console.log('Leader boards triggered by ' + event.Records[0].s3.object.key);
    }
  }

  // Rebuild all leader boards
  request.post({url: process.env.SERVICEURL + 'craps/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'roulette/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'blackjack/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'videopoker/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'slots/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'war/populateLeaderBoardFromDB'});
  request.post({url: process.env.SERVICEURL + 'baccarat/populateLeaderBoardFromDB'});

  console.log('Rebuilt leader boards!');
  callback();
};
