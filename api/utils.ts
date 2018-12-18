import * as del from 'del';
import { Collection } from 'lokijs';

const functionFilter = function (req, file, cb) {
    // accept image only
    if (!file.originalname.match(/\.(zip|ts|js)$/)) {
        return cb(new Error('Only image files are allowed!'), false);
    }
    cb(null, true);
};

const loadCollection = function (colName, db: Loki): Promise<Collection<any>> {
    return new Promise(resolve => {
        db.loadDatabase({}, () => {
            const _collection = db.getCollection(colName) || db.addCollection(colName);
            resolve(_collection);
        })
    });
}

const cleanFolder = function (folderPath) {
    // delete files inside folder but not the folder itself
    del.sync([`${folderPath}/**`, `!${folderPath}`]);
};

export { functionFilter, loadCollection, cleanFolder }
