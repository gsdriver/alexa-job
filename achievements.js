'use strict';

const blackjack = require('./blackjack');

blackjack.getAchievementScores((err, daysPlayed) => {
  if (err) {
    console.log(err);
  } else {
    let day;
    const results = [];
    for (day in daysPlayed) {
      if (day) {
        results.push({days: day, players: daysPlayed[day]});
      }
    }
    results.sort((a, b) => (a.days - b.days));
    console.log('days,players');
    results.forEach((result) => {
      console.log(result.days + ',' + result.players);
    });
  }
});
