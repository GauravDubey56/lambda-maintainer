const { execSync } = require("child_process");
const fs = require("fs");
const dotenv = require("dotenv");
dotenv.config();
const path = require("path");
const AWS = require("aws-sdk");
const awsLambdaConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_FUNCTION_REGION,
};
const awsS3Config = {
  awsAccessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_S3_REGION,
};
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
const SCRIPT_DIR = path.dirname(__filename);
// AWS Lambda Layer configuration
const { LAYER_NAME, DESCRIPTION, RUNTIME, S3_BUCKET } = process.env;
const { S3_KEY, FILE_KEY } = generateS3Key(LAYER_NAME);
let PACKAGE_JSON_PATH = process.env.PACKAGE_JSON_PATH;
if (!PACKAGE_JSON_PATH) {
  PACKAGE_JSON_PATH = findPackageJson(SCRIPT_DIR);
}

// Construct the absolute path to the package.json file
const ABSOLUTE_PACKAGE_JSON_PATH = path.join(PACKAGE_JSON_PATH);

const TEMP_DIR = SCRIPT_DIR + "/TEMP_DIR";
const LAYER_CONTENTS = path.join(TEMP_DIR, "layer_contents");

// Create the folder structure and copy package.json
fs.mkdirSync(path.join(LAYER_CONTENTS, "nodejs"), { recursive: true });
fs.copyFileSync(
  ABSOLUTE_PACKAGE_JSON_PATH,
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
    Bucket: S3_BUCKET,
    Key: S3_KEY,
    Body: zipFileContent,
  },
  (err, data) => {
    if (err) {
      console.error("Error uploading ZIP file to S3:", err);
    } else {
      console.log("Uploaded ZIP file to S3:", data.Location);
      // Publish the Lambda layer version
      const lambda = new AWS.Lambda(awsLambdaConfig);
      lambda.publishLayerVersion(
        {
          LayerName: LAYER_NAME,
          Description: DESCRIPTION,
          Content: {
            S3Bucket: S3_BUCKET,
            S3Key: S3_KEY,
          },
          CompatibleRuntimes: [RUNTIME],
        },
        (err, data) => {
          if (err) {
            console.error("Error publishing Lambda layer version:", err);
          } else {
            console.log("Published Lambda layer version:", data.Version);
          }
          // Clean up temporary files
          fs.rmSync(TEMP_DIR, { recursive: true });
        }
      );
    }
  }
);
