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



exports.createFolder = (functionName) => {
    const currentDir = process.cwd();
    const folderPath = `${currentDir}/${functionName}`;
    const functionInfo = {
        functionName: functionName
    }
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath);
        console.log('creating directory: ', folderPath)
    } else {
        console.error('Directory already exists');
        return
    }

    const indexFileContent = fs.readFileSync(__dirname + '/init_folder/index.js', 'utf-8');

    fs.writeFileSync(`${folderPath}/index.js`, indexFileContent);
    fs.writeFileSync(`${folderPath}/function_info.json`, JSON.stringify(functionInfo, null, 2));
    console.log('Function created successfully')

    return folderPath;
}