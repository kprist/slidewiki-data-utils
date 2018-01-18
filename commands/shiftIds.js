'use strict';

const async = require('async');
const ProgressBar = require('progress');

const processors = require('../lib/processors');

module.exports = {

    execute: function(argv) {
        let collection = argv.collection;
        let offset = argv.offset;

        connect(argv).then((db) => {

            let processor = processors.get(collection);
            async.eachSeries(processor.dependents, (dependent, done) => {
                console.log(`Processing ${collection} ids referenced in ${dependent}:`);

                let col = db.collection(dependent);
                let bulk = col.initializeUnorderedBulkOp();
                let cursor = col.find(processor.filterFor(dependent));
                cursor.count().then((docCount) => {
                    let progressBar;
                    if (!argv.dry) {
                        progressBar = new ProgressBar('    preparing update for :total documents: :bar (:percent)', { total: docCount });
                    }

                    cursor.forEach((doc) => {
                        try {
                            if (progressBar) progressBar.tick();

                            let setOp = processor.updateReferencesIn(dependent, doc, (id) => (id + offset));
                            if (Object.keys(setOp).length === 0) {
                                // console.warn(`no references to update in document ${JSON.stringify(doc)}`);
                                return;
                            }

                            if (argv.dry) {
                                console.log({ _id: doc._id }, { $set: setOp });
                            } else {
                                bulk.find({ _id: doc._id }).updateOne({ $set: setOp });
                            }
                        } catch (e) {
                            // HOW TO EXIT GRACEFULLY WITHOUT IGNORING THESE ERRORS???
                            let errorMessage = `invalid data in ${dependent} document ${JSON.stringify(doc)}\n    cause was: ${e}`;
                            // console.warn(errorMessage);
                            throw new Error(errorMessage);
                        }

                    }, (err) => {
                        if (err) return done(err);
                        if (argv.dry) return done();

                        // now we can execute the bulkop
                        process.stdout.write('    applying update...');
                        bulk.execute().then(() => {
                            console.log('done!');
                            done();
                        }).catch((err) => done(err));
                    });

                }).catch(done);

            }, (err) => {
                if (err) {
                    console.error(err);
                    return db.close();
                }

                if (argv.dry) return db.close();

                process.stdout.write(`Updating ids in ${collection}...`);

                // after we are done with processing dependents, we can also update the collection itself
                let col = db.collection(collection);
                // we can't update _id in place, so we use aggregation to copy documents while also increasing _id
                col.aggregate([
                    { $addFields: { '_id': { $sum: ['$_id', offset] } } },
                    { $out: collection },
                ], (err) => {
                    if (err) throw err;

                    // then purge the collection of the old documents
                    let query;
                    if (offset >= 0) {
                        // if offset is positive, that means any _id less that offset
                        query = { _id: { $lt: offset } };
                    } else {
                        // if offset is negative, that means any _id more that negative of offset
                        query = { _id: { $gt: -offset } };
                    }

                    console.log('done!');
                    process.stdout.write('Purging old ids from collection...');
                    col.deleteMany(query, (err) => {
                        if (err) throw err;

                        console.log('done!');
                        db.close();
                    });

                });

            });

        }).catch((err) => {
            console.error(err);
        });

    }

};

const MongoClient = require('mongodb').MongoClient;

function connect(argv) {
    // Initialize connection once
    return MongoClient.connect(`mongodb://${argv.host}:${argv.port}/${argv.db}`)
        .then((database) => {
            console.log(`Connected to mongo instance ${argv.host}:${argv.port}/${argv.db}`);
            return database;
        });
}
