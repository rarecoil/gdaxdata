#!/usr/bin/env node

const Sequelize = require('sequelize');
const Op = require('sequelize').Op;
const moment = require('moment');
const AWS = require('aws-sdk');

const child_process = require('child_process');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');

const Ticker = require('./lib/ticker');
const Config = require('./lib/config');
const config = new Config('./config.json');

/*
    Builds the index.html page and torrent file for the data.
*/
const SITE_FILE_PATH = path.resolve(config.get('site_path'));
const MANIFEST_LOCATION = path.join(SITE_FILE_PATH, 'manifest.json');

process.chdir(__dirname);
let begin = moment().date(0).valueOf();
let end = moment().date(moment().daysInMonth()-1).valueOf();

let randHash = function () {
    return crypto.createHash('sha1').update(crypto.randomBytes(16)).digest('hex');
};

let uploadToS3 = async function (filepath) {
    return new Promise((resolve, reject) => {
        let s3 = new AWS.S3({
            endpoint: new AWS.Endpoint(config.get('s3_endpoint')),
            accessKeyId: config.get('s3_key'),
            secretAccessKey: config.get('s3_secret')
        });
        let basename = path.basename(filepath);
        if (fs.existsSync(filepath)) {
            let dataStream = fs.createReadStream(filepath);
            dataStream.on('error', function(err) {
                console.log('File Error', err);
                reject(false);
              });              
            let s3params = {
                Bucket: config.get('s3_bucket_name'),
                Key: path.join(config.get('s3_path'), basename),
                Body: dataStream
            };
            s3.upload(s3params, (err, data) => {
                if (err) {
                  console.log("Error", err);
                  reject(false);
                } if (data) {
                  resolve(data.Location);
                }
            });
        } else {
            console.error("Could not find file " + filepath + " to upload to S3");
            reject(false);
        }
    });
};

let exportDatabase = async function(begin, end) {
    return new Promise((resolve, reject) => {
        let temp_db_filename = randHash() + '.sqlite';
        let temp_db_filepath = path.join('/tmp', temp_db_filename);

        let export_db = new Sequelize({
            dialect: 'sqlite',
            storage: temp_db_filepath,
            operatorsAliases: false,
            logging: false
        });

        // TODO this is dirty, fix all of this ugly mess into something pretty
        var dataEntry = export_db.define('data', {
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

        console.log("Creating database and exporting results to SQLite.");
        console.log("This will take a while.");
        dataEntry.sync().then(() => {
            var promises = []; // and they still feel oh so wasted on myself

            // we will need to paginate this otherwise we get oom killed
            // on shitty VPS with no memory

            // TODO fucking figure out if we're gonna use promises or async/await
            // choose one or the other
            Ticker.count({
                where: {
                    time: {
                        [Op.between]: [begin, end]
                    }
                },
                order: [['sequence', 'ASC']]
            }).then(async (count) => {
                let pages = Math.ceil(count / 10000);
                let pages_saved = 0;
                let successes = 0;
                let failures = 0;
                for (let i=0; i<pages; i++) {
                    let results = await Ticker.findAll({
                        where: {
                            time: {
                                [Op.between]: [begin, end]
                            }
                        },
                        order: [['sequence', 'ASC']],
                        offset: (i * 9999),
                        limit: 10000
                    });
                    console.info("Saving entry " + ((i+1)*10000) + "/" + (pages*10000) + "...");
                    for (let j=0; j<results.length; j++) {
                        let result = results[j];
                        try {
                            // TODO optimize for speed, too much awaiting
                            let ret = await dataEntry.build({
                                product_id: result.product_id,
                                sequence: result.sequence,
                                time: result.time,
                                price: result.price,
                                last_size: result.last_size,
                                best_bid: result.best_bid,
                                best_ask: result.best_ask,
                                volume_24h: result.volume_24h,
                                low_24h: result.low_24h,
                                high_24h: result.high_24h
                            }).save();
                            successes++;
                        } catch (e) {
                            console.error(ret);
                            failures++;
                        }
                    }
                }
                if (failures !== 0) {
                    console.error("Saving failed for " + failures + " entries.");
                    reject(false);
                } else {
                    console.log('Database snapshot saved, ' + successes + ' rows created.');
                    resolve([temp_db_filepath, successes]);
                }
            });
        });
    });
};

let getDataMonths = async function() {
    // get a list of year/month tuples in the db
    let results = [];
    let now = moment();
    let result = await Ticker.findOne({ order: [['time', 'asc' ]] });
    if (result) {
        let earliest = moment(result.time);
        result = await Ticker.findOne({ order: [['time', 'desc' ]] });
        let latest = moment(result.time);
        // is earliest latest?
        let earliestTriplet = [ earliest.year(), earliest.month(), earliest.startOf('month').valueOf() ];
        if (earliest.format('YYYY-MM') === latest.format('YYYY-MM')) {
            return [earliestTriplet];
        }
        let latestTriplet = [ earliest.year(), earliest.month(), earliest.startOf('month').valueOf() ];
        // we need to ratchet forward from year, month to end of db
        for (let i = earliest.year(); i <= latest.year(); i++) {
            // moment months are zero-indexed
            for (let j = earliest.month(); i < 12; i++) {
                if (i === latest.year() && j > latest.month()) {
                    // short circuit for months we don't have yet
                    break;
                }
                let dataBegin = moment().year(i).month(j);
                let dataEnd = moment().year(i).month(j) + moment().daysInMonth(j);
                // ask the db for any one result here
                let result = await Ticker.findOne({ where: { time: { [Op.between]: [dataBegin, dataEnd] }}});
                if (result) {
                    // we have data in the db for this month
                    results.push([dateBegin.year(), dataBegin.month(), dateBegin.startOf('month').valueOf() ]);
                }
            }
        }
    }
    return results;
};

// rebuilds the index file from the template
let rebuildIndex = function(manifest_data) {
    let index_template_path = path.join(SITE_FILE_PATH, 'index.template.html');
    let index_path = path.join(SITE_FILE_PATH, 'index.html');
    let indexData = fs.readFileSync(index_template_path, {encoding: 'utf-8'});

    let templateBeginPos = indexData.indexOf('<!-- ### BEGIN_TEMPLATE -->') + 27;
    let templateEndPos = indexData.indexOf('<!-- ### END_TEMPLATE -->');
    let template = indexData.substr(templateBeginPos, templateEndPos - templateBeginPos);
    
    let generated = '';
    if (manifest_data.files) {
        for (let date_key in manifest_data.files) {
            let working_template = template;
            let file_location = manifest_data.files[date_key].uri;
            let file_size = manifest_data.files[date_key].size;
            let file_count = manifest_data.files[date_key].count;
            let date = moment();
            if (date_key === 'nightly') {
                working_template = working_template.replace('{{MONTH}}', date.format('MMMM [(nightly)]'));
            } else {
                date = moment(date_key, 'YYYY-MM');
                working_template = working_template.replace('{{MONTH}}', date.format('MMMM'));
            }
            working_template = working_template.replace('{{YEAR}}', date.format('YYYY'));
            working_template = working_template.replace('{{FILE_SIZE}}', file_size + 'M');
            working_template = working_template.replace('{{TOTAL_ENTRIES}}', file_count);
            working_template = working_template.replace('{{FILE_LINK}}', file_location);
            working_template = working_template.replace(' id="template"', '');

            generated += working_template.trimRight();
        }
    }
    let generatedBegin = indexData.indexOf('<!-- ### GENERATED -->') + 22;
    indexData = indexData.substr(0, generatedBegin) + generated + indexData.substr(generatedBegin);
    fs.writeFileSync(index_path, indexData, { encoding: 'utf-8' });
};

let main = async function() {

    if (!fs.existsSync(MANIFEST_LOCATION)) {
        console.warn("Could not find manifest in site location. Copying template.");
        fs.copyFileSync(path.join(SITE_FILE_PATH, 'manifest.template.json'), MANIFEST_LOCATION);
    }
    let manifest_filepath = path.join(SITE_FILE_PATH, 'manifest.json');
    let manifest = JSON.parse(fs.readFileSync(manifest_filepath, {encoding: 'utf-8'}));

    // look through the database and see what months we have data for that we haven't built
    // monthly datasets for.
    let months = await getDataMonths();
    let now = moment();
    months.forEach(async (month) => {
        month = moment(month[2]);
        let nightly = (now.format('YYYY-MM') === month.format('YYYY-MM'));
        let filename = path.join("/tmp/", "gdax_ticker_" + month.format('YYYY-MM') + '.sqlite');
        
        // check against the manifest. Do we have a snapshot already for this month?
        // if not, create and upload one to S3.
        // (note that if this is a nightly, always recreate the current month)
        if ((Object.keys(manifest.files).indexOf(month.format('YYYY-MM')) === -1) || nightly) {
            // we need to create this, we don't have it in the manifest and/or it's the nightly
            // nightly is keyed as "nightly" in the manifest.
            let caption = "Creating data dump for " + month.format('YYYY-MM');
            if (nightly) { caption += " (nightly)"; }
            caption += "...";
            console.info(caption);

            let start = month.startOf(month).valueOf();
            let end = month.date(moment().daysInMonth()-1).valueOf();
            let ret = await exportDatabase(start, end);
            let dbpath = ret[0];
            let num_entries = ret[1];

            // TODO: look at tempfile security in node
            fs.copyFileSync(dbpath, filename);
            fs.unlinkSync(dbpath);

            console.info("Compressing file.");
            child_process.spawnSync('gzip', [' -8 ', filename]);
            let compressed_file_path = filename + '.gz';
            let uri = false;
            if (compressed_file_path) {
                let stat = fs.statSync(compressed_file_path);
                let db_size = Math.round(stat.size / 1000000.0);
                console.info("Successfully created file.");

                if (config.get('use_s3') === true) {
                    console.info("Uploading to S3");
                    try {
                        uri = await uploadToS3(compressed_file_path);
                        console.info("Successful upload to S3.");

                        try {
                            // get them off the server
                            fs.unlinkSync(filename);
                            fs.unlinkSync(compressed_file_path);
                        } catch(e) {
                            console.error("Files went away for some reason.");
                        }
                    } catch (e) {
                        console.error("Could not upload file " + compressed_file_path);
                        console.debug(e);
                        try {
                            // get them off the server
                            fs.unlinkSync(filename);
                            fs.unlinkSync(compressed_file_path);
                        } catch(e) {
                            console.error("Files went away for some reason.");
                        }
                        return;
                    }
                } else {
                    let new_path = path.join(config.get('site_data_path'), path.basename(compressed_file_path))
                    fs.copyFileSync(compressed_file_path, new_path);
                    uri = config.get('site_data_uri') + compressed_file_path; 
                }
                // update manifest now that this has been uploaded.
                if (nightly) {
                    manifest.files['nightly'] = {
                        uri: uri,
                        count: num_entries,
                        size: db_size
                    };
                } else {
                    manifest.files[month.format('YYYY-MM')] = {
                        uri: uri,
                        count: num_entries,
                        size: db_size
                    };
                }
                manifest.last_updated = new Date().getTime();
                fs.writeFileSync(manifest_filepath, JSON.stringify(manifest, undefined, 2), {encoding: 'utf-8'});
                console.info("Updated manifest.");

                // update static site
                console.info("Generating new HTML page...");
                rebuildIndex(manifest);
                console.info("Done!")
            } else {
                console.error("Something went wrong during GZIP compression on file " + filename);
            }
        }

    });
};

main();
