const { withInfoPlist } = require('@expo/config-plugins');

/**
 * iPhone stays portrait. iPad rotates, which is also how the app is resized
 * when it runs as a Designed for iPad app on Apple silicon Macs.
 */
function withIpadOrientations(config) {
  return withInfoPlist(config, (mod) => {
    mod.modResults.UISupportedInterfaceOrientations = ['UIInterfaceOrientationPortrait'];
    mod.modResults['UISupportedInterfaceOrientations~ipad'] = [
      'UIInterfaceOrientationPortrait',
      'UIInterfaceOrientationPortraitUpsideDown',
      'UIInterfaceOrientationLandscapeLeft',
      'UIInterfaceOrientationLandscapeRight',
    ];
    mod.modResults.UIRequiresFullScreen = false;
    return mod;
  });
}

module.exports = withIpadOrientations;
