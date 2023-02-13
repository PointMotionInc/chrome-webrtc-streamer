const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: 'production',
  entry: {
    background: path.resolve(__dirname, '..', 'src', 'background.ts'),
    content: path.resolve(__dirname, '..', 'src', 'content.ts'),
  },
  output: {
    path: path.join(__dirname, '../dist'),
    filename: '[name].js',
  },
  resolve: {
    extensions: ['.ts', '.js'],
  },
  module: {
    rules: [
      {
        test: /\.tsx?$/,
        loader: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: '.', to: '.', context: 'public' }],
    }),
  ],
  watch: false,
  watchOptions: {
    ignored: [
      path.resolve(__dirname, '..', 'dist'),
      path.resolve(__dirname, '..', 'node_modules'),
    ],
    poll: 2000,
  },
};
