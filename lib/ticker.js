const path = require('path');

const Sequelize = require('sequelize');

let dbpath = "./test.sqlite";
if (require.main && require.main.filename) {
  dbpath = path.join(path.dirname(require.main.filename), './data.sqlite');
}
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: dbpath,
  operatorsAliases: false,
  logging: false
});

const Ticker = sequelize.define('ticker', {
  "source": { type: Sequelize.ENUM('bitfinex', 'gdax') },
  "pair": { type: Sequelize.STRING },
  "time": { type: Sequelize.BIGINT },
  "price": { type: Sequelize.DOUBLE },
  "best_bid": { type: Sequelize.DOUBLE },
  "best_ask": { type: Sequelize.DOUBLE },

  // for GDAX, these are 24h
  "volume": { type: Sequelize.DOUBLE },
  "low": { type: Sequelize.DOUBLE },
  "high": { type: Sequelize.DOUBLE },

  // GDAX-specific
  "gdax_sequence": { type: Sequelize.BIGINT },
  "gdax_last_size": { type: Sequelize.DOUBLE },

  // BitFinex-specific
  "bitfinex_bid_size": { type: Sequelize.DOUBLE },
  "bitfinex_ask_size": { type: Sequelize.DOUBLE },
  "bitfinex_daily_change": { type: Sequelize.DOUBLE },
  "bitfinex_daily_change_perc": { type: Sequelize.DOUBLE }
});

Ticker.sync();

module.exports = Ticker;

