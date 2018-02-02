//
// Processes jackpot files
//

'use strict';

const fs = require('fs');
const contentDir = 'content/jackpots';
const csvFile = 'jackpots.csv';

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
            const jackpot = {};
            const details = filename.split('.')[0].split('-');

            jackpot.amount = JSON.parse(content).amount;
            jackpot.timestamp = details[1];
            jackpot.game = details[0];
            results.push(jackpot);
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

fs.readdir(contentDir, (err, filenames) => {
  if (err) {
    callback(err, null);
  } else {
    let text = 'Date,Skill,Game,Amount\n';
    let dirCount = filenames.length;

    filenames.forEach((filename) => {
      readFiles(contentDir + '/' + filename, (err, results) => {
        results.sort((a, b) => (a.timestamp - b.timestamp));
        results.forEach((result) => {
          const recordDate = new Date(parseInt(result.timestamp));
          console.log(recordDate);
          text += getFormattedDate(recordDate) + ',' + filename + ',' + result.game + ',' + result.amount + '\n';
        });

        if (--dirCount === 0) {
          completed();
        }
      });
    });

    function completed() {
      fs.writeFile(csvFile, text, (err) => {
        console.log(err ? err : 'Done');
      });
    }
  }
});
