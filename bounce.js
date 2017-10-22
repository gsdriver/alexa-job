'use strict';

const fs = require('fs');
const utils = require('./utils');

if (process.argv.length === 3) {
  utils.getBounceResults(process.argv[2], (text) => {
    writeResults(process.argv[2], text);
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
      writeResults(skills[i], results[skills[i]]);
    }
  }
}

function writeResults(skill, text) {
  const csvFile = 'bounce-' + skill + '.csv';

  // Delete the csv file if it exists
  if (fs.existsSync(csvFile)) {
    fs.unlinkSync(csvFile);
  }

  fs.writeFile(csvFile, text, (err) => {
    if (err) {
      console.log(err);
    }
  });
}
