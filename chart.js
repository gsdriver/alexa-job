//
// Utility functions
//

'use strict';

const fs = require('fs');

// Read every file from the content directory
function readFiles(dirname, callback) {
  const results = [];

  fs.readdir(dirname, (err, filenames) => {
    if (err) {
      callback(err, null);
    } else {
      let fileCount = filenames.length;

      filenames.forEach((filename) => {
        fs.readFile(dirname + '/' + filename, 'utf-8', (err, content) => {
          if (err) {
            callback(err, null);
          } else {
            results.push(JSON.parse(content));
            if (--fileCount === 0) {
              callback(null, results);
            }
          }
        });
      });
    }
  });
}

function getFormattedDate(date) {
  const year = date.getFullYear();
  const month = (1 + date.getMonth()).toString();
  const day = date.getDate().toString();

  return month + '/' + day + '/' + year;
}

// Read files and write to a CSV file
readFiles('content/newusers', (err, results) => {
  if (err) {
    console.log(err);
  } else {
    // Now go through each result and write to a CSV file
    let text = 'Date,Roulette,Blackjack,Slots\n';

    results.forEach((result) => {
      text += getFormattedDate(new Date(result.timestamp)) + ',' + result.roulette + ',' + result.blackjack + ',' + result.slots + '\n';
    });

    fs.writeFile('content/newusers/summary.csv', text, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }
});
