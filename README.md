# gdaxdata

#### A historical data archiver for GDAX

This is a small collection of scripts and a static website used to generate the data on
my [GDAX historical data archive](https://etheria.io/gdaxdata) site. I do not support it,
but I leave it here in case you may want to run your own data repository, or perhaps
gather historical data for other pairs (such as BTC-USD).

I built this because I wanted historical GDAX data for data analysis purposes, and
understand that some traders may find it useful to have this data for algorithmic trading
backtesting or the equivalent. Feel free to run this for yourself. **I do not support this
package and you are on your own if you have bugs.**


### Usage

Copy `config.sample.json` to `config.json`, then edit with your information.

`build_site.js` will build the static website and generate the snapshot SQLite3 databases
from the canonical one.

`monitor.js` is the file that needs to run to listen to GDAX and save things into the database.


### License

GPL 3.0.