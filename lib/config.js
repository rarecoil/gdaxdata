const fs  = require('fs');

class Config {

    constructor (config_file=null) {
        // TODO
        this.DEFAULTS = {

        };
        this.configData = Object.assign({}, this.DEFAULTS);
        if (config_file !== null) {
            if(fs.existsSync(config_file)) {
                let fileData = fs.readFileSync(config_file);
                try {
                    let configObject = JSON.parse(fileData);
                    this.configData = Object.assign(this.configData, configObject);
                }
                catch (e) {
                    console.warn("Cannot load configuration data.");
                }
            }
        }
    }

    get (key='') {
        if (key === '') return this.configData;
        let keyTree = key.split('.');
        let subtree = this.configData;
        for (let i=0; i < keyTree.length; i++) {
            if (Object.keys(subtree).indexOf(keyTree[i]) >= 0) {
                subtree = subtree[keyTree[i]];
            } else {
                return null;
            }
        }
        return subtree;
    }

}

module.exports = Config;