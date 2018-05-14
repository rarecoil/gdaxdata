#!/usr/bin/env node

const GdaxTickerListener = require('./lib/gdax');

const Config = require('./lib/config');
const config = new Config('config.json');

const listener = new GdaxTickerListener({
    key: config.get('gdax_api_key'),
    secret: config.get('gdax_api_secret'),
    passphrase: config.get('gdax_api_passphrase')
});

listener.listen();