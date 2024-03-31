const { execSync } = require("child_process");
const fs = require("fs");
const dotenv = require("dotenv");
const Utils = require("./utils");
dotenv.config();
const path = require("path");
const AWS = require("aws-sdk");


const generateS3Key = (layerName) => {
  const currentDate = new Date().toISOString().split("T")[0];
  const FILE_KEY = `${layerName}_${Date.now().toString()}.zip`;
  return { S3_KEY: `${currentDate}/${FILE_KEY}`, FILE_KEY };
};
const findPackageJson = (directory) => {
  const files = fs.readdirSync(directory);

  for (const file of files) {
    const filePath = path.join(directory, file);
    const stats = fs.statSync(filePath);

    if (stats.isDirectory() && !filePath.includes("node_modules")) {
      // If it's a directory, recursively search inside
      const packageJsonPath = findPackageJson(filePath);
      if (packageJsonPath) {
        return packageJsonPath;
      }
    } else if (file === "package.json") {
      // If it's a package.json file, return its path
      return filePath;
    }
  }

  return null; // Package.json not found in this directory or its subdirectories
};
// Determine the absolute path to the script directory
const SCRIPT_DIR = process.cwd();
// AWS Lambda Layer configuration;
let PACKAGE_JSON_PATH = process.env.PACKAGE_JSON_PATH;
if (!PACKAGE_JSON_PATH) {
  PACKAGE_JSON_PATH = findPackageJson(SCRIPT_DIR);
}

// Construct the absolute path to the package.json file
// const ABSOLUTE_PACKAGE_JSON_PATH = path.join(PACKAGE_JSON_PATH);

const TEMP_DIR = SCRIPT_DIR + "/TEMP_DIR";
const LAYER_CONTENTS = path.join(TEMP_DIR, "layer_contents");

// Create the folder structure and copy package.json
const uploadLayerToAws = (awsS3Config, {packageJsonPath, layerName, layerBucketName}) => {
  return new Promise((resolve, reject) => {

  
  const DESCRIPTION = "Node.js dependencies for Lambda functions";
  const RUNTIME = "nodejs18.x";
  const { S3_KEY, FILE_KEY } = generateS3Key(layerName)
    fs.mkdirSync(path.join(LAYER_CONTENTS, "nodejs"), { recursive: true });
    fs.copyFileSync(
      packageJsonPath,
      path.join(LAYER_CONTENTS, "nodejs", "package.json")
    );

    // Install Node.js dependencies inside the folder structure
    process.chdir(path.join(LAYER_CONTENTS, "nodejs"));
    execSync("npm install --production", { stdio: "inherit" });

    // Create a ZIP archive of the Lambda layer contents
    process.chdir(LAYER_CONTENTS);
    execSync(`zip -r ${FILE_KEY} nodejs`, { stdio: "inherit" });

    // Upload the ZIP archive to S3
    const s3 = new AWS.S3(awsS3Config);
    const zipFileContent = fs.readFileSync(
      path.join(LAYER_CONTENTS, `${FILE_KEY}`)
    );

    s3.upload(
      {
        Bucket: layerBucketName,
        Key: S3_KEY,
        Body: zipFileContent,
      },
      (err, data) => {
        if (err) {
          console.error("Error uploading ZIP file to S3:", err);
          fs.rmSync(TEMP_DIR, { recursive: true });
          reject();
          return;
        } else {
          console.log("Uploaded ZIP file to S3:", data.Location);
          // Publish the Lambda layer version
          const lambda = new AWS.Lambda(awsS3Config);
          lambda.publishLayerVersion(
            {
              LayerName: layerName,
              Description: DESCRIPTION,
              Content: {
                S3Bucket: layerBucketName,
                S3Key: S3_KEY,
              },
              CompatibleRuntimes: [RUNTIME],
            },
            (err, data) => {
              if (err) {
                console.error("Error publishing Lambda layer version:", err);
                reject('Could not upload layer');
              } else {
                console.log("Published Lambda layer version:", data.Version);
                fs.rmSync(TEMP_DIR, { recursive: true });
                resolve({
                  version: data.Version,
                  layerVersionArn: data.LayerVersionArn,
                  layerArn: data.LayerArn
                });
              }
              // Clean up temporary files
              
              return;
            }
          );
        }
      }
    );
  });
};

module.exports.uploadLayer = () => {
  return new Promise(async (resolve, reject) => {
    try {
      if(!fs.existsSync("package.json")) {
        console.error("package.json not found in the current directory");
        resolve();
        return;
      }
      if(!fs.existsSync("function_info.json")) {
        console.error("function_info.json not found in the current directory");
        resolve();
        return;      
      }

      const functionInfo = Utils.readJson("function_info.json");

      if (!functionInfo) {
        console.error("Function info not found");
        resolve();
        return;
      }

      if(!functionInfo.layerName) {
        console.error("Layer name not found in function_info.json");
        resolve();
        return;
      }

      const awsInfo = Utils.loadAwsAccessInfo();

      if(!awsInfo.layerStorageBucket) {
        console.error("Layer bucket name not found in aws_info.json");
        resolve();
        return; 
      }


      const packageJsonPath = process.cwd() + "/package.json";

      const dependencies = Utils.readJson(packageJsonPath)?.dependencies || {};
      if(Object.keys(dependencies).length === 0) {
        console.error("No dependencies found in package.json");
        resolve();
        return;
      }

      const layerUpload = await uploadLayerToAws(awsInfo, {
        packageJsonPath,
        layerBucketName: awsInfo.layerStorageBucket,
        layerName: functionInfo.layerName,
      });
      resolve(layerUpload);
    } catch (error) {
      console.error("Error uploading Lambda layer:", error);
      reject(error);
    }
  });
};
