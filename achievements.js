'use strict';

const blackjack = require('./blackjack');
const roulette = require('./roulette');

let numCalls = 2;
let blackjackDays;
let rouletteDays;

blackjack.getAchievementScores((err, daysPlayed) => {
  blackjackDays = getPlayersPerDay(daysPlayed);
  if (--numCalls === 0) {
    completed();
  }
});

roulette.getAchievementScores((err, daysPlayed) => {
  rouletteDays = getPlayersPerDay(daysPlayed);
  if (--numCalls === 0) {
    completed();
  }
});

function completed() {
  console.log('blackjack');
  console.log('days,players');
  blackjackDays.forEach((result) => {
    console.log(result.days + ',' + result.players);
  });

  console.log('roulette');
  console.log('days,players');
  rouletteDays.forEach((result) => {
    console.log(result.days + ',' + result.players);
  });
}

function getPlayersPerDay(daysPlayed) {
  let day;
  const results = [];
  for (day in daysPlayed) {
    if (day) {
      results.push({days: day, players: daysPlayed[day]});
    }
  }
  results.sort((a, b) => (a.days - b.days));
  return results;
}
