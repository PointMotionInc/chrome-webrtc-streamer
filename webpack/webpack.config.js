const path = require('path');
const CopyPlugin = require('copy-webpack-plugin');
const miniCssExtractPlugin = require('mini-css-extract-plugin');

/**
 * @type {import('webpack').Configuration}
 */
module.exports = {
  mode: 'production',
  entry: {
    background: path.resolve(__dirname, '..', 'src', 'background.ts'),
    content: path.resolve(__dirname, '..', 'src', 'content.ts'),
    popup: path.resolve(__dirname, '..', 'src', 'popup.ts'),
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
      {
        test: /\.(scss)$/,
        use: [
          {
            // we can use miniCssExtractPlugin.loader instead of style-loader if we want a minified css file
            loader: miniCssExtractPlugin.loader,
            // loader: 'style-loader',
          },
          {
            loader: 'css-loader',
          },
          {
            loader: 'postcss-loader',
            options: {
              postcssOptions: {
                plugins: () => [require('autoprefixer')],
              },
            },
          },
          {
            loader: 'sass-loader',
          },
        ],
      },
    ],
  },
  plugins: [
    new CopyPlugin({
      patterns: [{ from: '.', to: '.', context: 'public' }],
    }),
    new miniCssExtractPlugin(),
  ],
  watch: false,
  watchOptions: {
    ignored: [
      path.resolve(__dirname, '..', 'dist'),
      path.resolve(__dirname, '..', 'node_modules'),
    ],
    poll: 2000,
  },
  devServer: {
    watchFiles: {
      paths: [
        path.resolve(__dirname, '..', 'src'),
        path.resolve(__dirname, '..', 'public'),
      ],
      options: {
        usePolling: false,
      },
    },
    static: path.resolve(__dirname, '..', 'dist'),
    port: 8080,
    hot: true,
  },
};
