'use strict';

const utils = require('./utils');

if (process.argv.length === 3) {
  utils.getBounceResults(process.argv[2], (text) => {
    console.log(text);
  });
} else {
  const skills = ['blackjack', 'roulette', 'craps', 'videopoker', 'slots'];
  let i;
  let numCalls = skills.length;
  const results = {};

  for (i = 0; i < skills.length; i++) {
    utils.getBounceResults(skills[i], function(text) {
      results[this.skill] = text;
      if (--numCalls === 0) {
        completed();
      }
    }.bind({skill: skills[i]}));
  }

  function completed() {
    for (i = 0; i < skills.length; i++) {
      console.log(results[skills[i]]);
    }
  }
}
