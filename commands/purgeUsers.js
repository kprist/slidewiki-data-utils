'use strict';

const dbutil = require('../lib/dbutil');
const processors = require('../lib/processors');

module.exports = {

    execute: async function(argv) {
        let db = await dbutil.connect(argv.db, argv.host, argv.port);
        try {
            let usersProcessor = processors.get('users');

            let usersSet = new Set();
            for (let dependent of usersProcessor.dependents) {
                for (let refPath of usersProcessor.getReferencePathsFor(dependent)) {
                    let query = refPath.query || {};
                    if (refPath.path) {
                        refPath = refPath.path;
                    }

                    for (let value of await db.collection(dependent).distinct(refPath, query)) {
                        if (Number(value) < 1) {
                            if (argv.verbose) console.warn('found invalid user reference:', value, 'at', dependent, '->', refPath);
                            continue; // skip it
                        }
                        usersSet.add(Number(value));
                    }
                }
            }

            let widowCount = await db.collection('users').count({ _id: { $not: { $in: [...usersSet] } } });
            let userCount = await db.collection('users').count();
            if (argv.dry || widowCount === 0) {
                return console.log(`Found ${widowCount} users (of ${userCount}) without reference in ${argv.db} collections`);
            }

            process.stdout.write('Removing users...');
            let opResult = await db.collection('users').deleteMany({ _id: { $not: { $in: [...usersSet] } } });
            console.log(`done (${opResult.result.n} users deleted)!`);

        } catch (err) {
            console.error(err);
        } finally {
            console.log(`Closing connection to ${argv.db}`);
            db.close();
        }

    }

};
