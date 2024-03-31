const fs = require('fs')
const path = require('path');
const constants = require('./constants');
const { execSync } = require('child_process');

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

exports.loadAwsAccessInfo = () => {
    const AWS_INFO_PATH = `${path.join(__dirname, constants.AWS_INFO_PATH)}.json`;
    let awsAccountInfo = this.readJson(AWS_INFO_PATH);
    if (!awsAccountInfo) {
        throw new Error('AWS account info not found');
    }
    return awsAccountInfo;
}

exports.createFolder = (functionName, layerName) => {
    const currentDir = process.cwd();
    const folderPath = `${currentDir}/${functionName}`;
    const functionInfo = {
        functionName,
        layerName
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
    
    process.chdir(folderPath);
    execSync('npm init -y', {stdio: 'inherit'});
    process.chdir(currentDir);

    console.log('Function created successfully')

    return folderPath;
}