//
// Utility functions
//

'use strict';

module.exports = {
  getAdSummary: function(data, adsPlayed) {
    let i;

    for (i = 0; i < data.Items.length; i++) {
      // Any ads played?
      if (data.Items[i].mapAttr && data.Items[i].mapAttr.M
              && data.Items[i].mapAttr.M.adsPlayed
              && data.Items[i].mapAttr.M.adsPlayed.M) {
        const ads = data.Items[i].mapAttr.M.adsPlayed.M;
        let ad;

        for (ad in ads) {
          if (adsPlayed[ad]) {
            adsPlayed[ad]++;
          } else {
            adsPlayed[ad] = 1;
          }
        }
      }
    }
  },
  getAdText: function(adsPlayed) {
    let text = '';

    if (adsPlayed) {
      let ad;

      text += 'Ads played - \r\n';
      for (ad in adsPlayed) {
        if (ad) {
          text += ('  ' + ad + ': ' + adsPlayed[ad] + '\r\n');
        }
      }
    }

    return text;
  },
};
