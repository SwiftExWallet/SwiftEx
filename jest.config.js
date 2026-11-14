module.exports = {
  preset: 'react-native',
  // @stellar/stellar-sdk pulls in ESM-only deps (uint8array-extras, @exodus, @noble); let Babel transform them.
  transformIgnorePatterns: [
    'node_modules/(?!((jest-)?react-native|@react-native(-community)?|uint8array-extras|@exodus|@stellar|@noble)/)',
  ],
};
