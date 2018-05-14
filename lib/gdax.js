const gdax = require('gdax');
const Ticker = require('./ticker');

class GdaxTickerListener {

    constructor (login_info) {
        this.login_info = login_info;

        // for status checks
        this._last_processed = 0;
        this._entries_processed = 0;
        this._entries_processed_since = 0;
    }

    listen () {
        this.client = this.connectWebsocketClient();

        this.client.on('message', this.handleTickerCallback.bind(this));
        this.client.on('error', this.handleTickerError.bind(this));
        this.client.on('close', this.handleConnectionClose.bind(this));
    }

    connectWebsocketClient (login_info=null) {
        if (typeof login_info !== 'object') {
            login_info = this.login_info;
        }

        return new gdax.WebsocketClient(
            ['ETH-USD', 'ETH-BTC', 'ETH-EUR'],
            'wss://ws-feed.gdax.com',
            login_info,
            { channels: ['ticker'] }
        );
    }

    handleTickerCallback (msg) {
        if (msg.type && msg.type !== 'ticker') return;
        if (typeof msg === 'object' && msg.type === 'ticker') {
            this._entries_processed++;
            this._entries_processed_since++;
            let now = new Date().getTime();
            if (now >= this._last_processed + 60000) {
                console.info("✔ Processed " + this._entries_processed_since + " new ticker entries (total " + this._entries_processed + ") ");
                this._entries_processed_since = 0;
                this._last_processed = new Date().getTime();
            }
            
            let t = Ticker.build({
                product_id: msg.product_id,
                sequence: msg.sequence,
                time: new Date().getTime(),
                price: parseFloat(msg.price),
                best_bid: parseFloat(msg.best_bid),
                best_ask: parseFloat(msg.best_ask),
                volume_24h: parseFloat(msg.volume_24h),
                low_24h: parseFloat(msg.low_24h),
                high_24h: parseFloat(msg.high_24h)
            }).save();
        }
    }
    
    handleTickerError (msg) {
        console.info("✘ Error condition from GDAX API");
        console.error(msg);
    }

    handleConnectionClose (msg) {
        console.info("✘ Connection closed. Reconnecting in 5 seconds.");
        setTimeout(this.listen.bind(this), 5000);
    }

}

module.exports = GdaxTickerListener;