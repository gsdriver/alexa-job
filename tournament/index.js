//
// Lambda function to close the tournaments
//

'use strict';

const request = require('request');

exports.handler = function(event, context, callback) {
  const now = new Date();

  // Close the roulette tournament down on Fridays
  // And blackjack on Wednesdays
  // And slots on Thursdays
  if (now.getDay() === 5) {
    console.log('Closing roulette tournament');
    request.post({url: process.env.SERVICEURL + 'roulette/closeTournament'});
  } else if (now.getDay() === 3) {
    console.log('Closing blackjack tournament');
    request.post({url: process.env.SERVICEURL + 'blackjack/closeTournament'});
  } else if (now.getDay() === 4) {
    console.log('Closing slots tournament');
    request.post({url: process.env.SERVICEURL + 'slots/closeTournament'});
  } else {
    console.log('Error - not the right day to call tournament close!');
  }

  callback();
};
