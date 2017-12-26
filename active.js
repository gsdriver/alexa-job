'use strict';

const blackjack = require('./blackjack');

let numCalls = 1;
let blackjackPlayers;

blackjack.getActivePlayers((err, players) => {
  blackjackPlayers = groupPlay(players);
  if (--numCalls === 0) {
    completed();
  }
});


function completed() {
  console.log('blackjack');
  console.log('Time since first play,Player Count');
  console.log('>120 days,' + blackjackPlayers['121']);
  console.log('61-120 days,' + blackjackPlayers['61']);
  console.log('31-60 days,' + blackjackPlayers['31']);
  console.log('8-30 days,' + blackjackPlayers['8']);
  console.log('In the last week,' + blackjackPlayers['lastweek']);
  console.log('No ad,' + blackjackPlayers['noad']);
}

function groupPlay(players) {
  const now = Date.now();
  const firstPlay = {'noad': 0, '121': 0, '61': 0, '31': 0, '8': 0, 'lastweek': 0};

  // Group first play into buckets
  // > 120 days
  // 61-120 days
  // 31-60 days
  // 8-30 days
  // Past 7 days
  players.forEach((player) => {
    if (player.first) {
      const diff = now - player.first;

      if (diff <= 7*24*60*60*1000) {
        firstPlay['lastweek']++;
      } else if (diff <= 30*24*60*60*1000) {
        firstPlay['8']++;
      } else if (diff <= 60*24*60*60*1000) {
        firstPlay['31']++;
      } else if (diff <= 120*24*60*60*1000) {
        firstPlay['61']++;
      } else {
        firstPlay['121']++;
      }
    } else {
      firstPlay['noad']++;
    }
  });

  return firstPlay;
}
