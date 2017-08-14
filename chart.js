//
// Utility functions
//

'use strict';

const fs = require('fs');
const contentDir = 'content/newusers';
const csvFile = 'newusers.csv';

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

// Delete the csv file if it exists
if (fs.existsSync(csvFile)) {
  fs.unlinkSync(csvFile);
}

// Read files and write to a CSV file
readFiles(contentDir, (err, results) => {
  if (err) {
    console.log(err);
  } else {
    // Now go through each result and write to a CSV file
    let text = 'Date,Roulette,Blackjack,Slots,Poker\n';

    results.sort((a, b) => (a.timestamp - b.timestamp));
    results.forEach((result) => {
      const recordDate = new Date(result.timestamp);
      recordDate.setDate(recordDate.getDate() - 1);
      if (result.poker !== undefined) {
        text += getFormattedDate(recordDate) + ',' + result.roulette + ',' + result.blackjack + ',' + result.slots + ',' + result.poker + '\n';
      } else {
        text += getFormattedDate(recordDate) + ',' + result.roulette + ',' + result.blackjack + ',' + result.slots + '\n';
      }
    });

    fs.writeFile(csvFile, text, (err) => {
      if (err) {
        console.log(err);
      }
    });
  }
});
