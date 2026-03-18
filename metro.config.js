const { getDefaultConfig, mergeConfig } = require('@react-native/metro-config');
const extraNodeModules = require('node-libs-react-native');
const path = require('path');

const config = {
  resolver: {
    extraNodeModules: {
      ...extraNodeModules,
      events: require.resolve('events/'),
      stream: require.resolve('stream-browserify'),
      crypto: require.resolve('react-native-crypto'),
      randomBytes: require.resolve('react-native-randombytes'),
      buffer: require.resolve('buffer/'),
      net: path.resolve(__dirname, 'shims/net.js'),
      tls: path.resolve(__dirname, 'shims/net.js'),
      net: path.resolve(__dirname, 'shims/net.js'),
      fs: path.resolve(__dirname, 'shims/fs.js'),
    },
    sourceExts: ['js', 'json', 'ts', 'tsx', 'cjs'],
  },
};

module.exports = mergeConfig(getDefaultConfig(__dirname), config);