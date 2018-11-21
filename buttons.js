'use strict';

const fs = require('fs');
const dirnames = ['content/spins/slots', 'content/spins/roulette'];
const csvFile = 'buttons.csv';

// Read every file from the content directory
function readFiles(dirname, callback) {
  const results = [];

  fs.readdir(dirname, (err, filenames) => {
    if (err) {
      callback(err, null);
    } else {
      let fileCount = filenames.length;

      filenames.forEach((filename) => {
        fs.readFile(dirname + '/' + filename, 'utf-8', function(err, content) {
          const timestamp = parseInt(this.filename.replace('.txt', ''));
          if (err) {
            callback(err, null);
          } else {
            const result = JSON.parse(content);
            result.timestamp = timestamp;
            results.push(result);
            if (--fileCount === 0) {
              callback(null, results);
            }
          }
        }.bind({filename: filename}));
      });
    }
  });
}

// Delete the csv file if it exists
if (fs.existsSync(csvFile)) {
  fs.unlinkSync(csvFile);
}

let text = 'Game,Locale,Length,Buttons,NonButtons\n';
let dirCount = dirnames.length;

dirnames.forEach((dirname) => {
  // Read files and write to a CSV file
  const names = dirname.split('/');

  readFiles(dirname, function(err, results) {
    if (err) {
      console.log(err);
    } else {
      // Now go through each result and write to a CSV file
      results.sort((a, b) => (a.timestamp - b.timestamp));
      results.forEach((result) => {
        text += (this.game + ',');
        if (result.locale !== undefined) {
          text += result.locale;
        }
        text += ',';
        if (result.length !== undefined) {
          text += result.length;
        }
        text += ',';
        if (result.spinButton !== undefined) {
          text += result.spinButton;
        }
        text += ',';
        if (result.spinNoButton !== undefined) {
          text += result.spinNoButton;
        }
        text += '\n';
      });

      if (--dirCount === 0) {
        fs.writeFile(csvFile, text, (err) => {
          if (err) {
            console.log(err);
          }
          console.log('done');
        });
      }
    }
  }.bind({game: names[2]}));
});
