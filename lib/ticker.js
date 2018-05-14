const path = require('path');

const Sequelize = require('sequelize');
const sequelize = new Sequelize({
  dialect: 'sqlite',
  storage: path.join(path.dirname(require.main.filename), './data.sqlite'),
  operatorsAliases: false,
  //logging: false
});

const Ticker = sequelize.define('ticker', {
  "product_id": { type: Sequelize.STRING },
  "sequence": { type: Sequelize.BIGINT },
  "time": { type: Sequelize.BIGINT },
  "price": { type: Sequelize.DOUBLE },
  "last_size": { type: Sequelize.DOUBLE },
  "best_bid": { type: Sequelize.DOUBLE },
  "best_ask": { type: Sequelize.DOUBLE },
  "volume_24h": { type: Sequelize.DOUBLE },
  "low_24h": { type: Sequelize.DOUBLE },
  "high_24h": { type: Sequelize.DOUBLE }
});

Ticker.sync();

module.exports = Ticker;

