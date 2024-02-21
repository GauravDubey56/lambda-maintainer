const fs = require('fs')
exports.saveJson = (jsonObject, pathName) => {
    fs.writeFileSync(pathName, JSON.stringify(jsonObject), 'utf-8');
}

exports.readJson = (pathName) => {
    try {
        const data =  JSON.parse(fs.readFileSync(pathName, 'utf-8'));
        return data;
    } catch (error) {
        // console.error('error in reading file', error.message);
        return null;
    }
}

