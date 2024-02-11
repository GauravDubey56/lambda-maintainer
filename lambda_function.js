const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");
const awsLambdaConfig = {
  accessKeyId: process.env.AWS_ACCESS_KEY_ID,
  secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  region: process.env.AWS_REGION,
};

const FUNCTION_PATH = process.env.LAMBDA_PATH;
// Create a new Lambda service object
AWS.config.update({ region: process.env.AWS_REGION });
AWS.config.credentials.accessKeyId = awsLambdaConfig.accessKeyId;
AWS.config.credentials.secretAccessKey = awsLambdaConfig.secretAccessKey;
const lambda = new AWS.Lambda(awsLambdaConfig);

// Read the code of your Lambda function
const ZIP_PATH = `${Date.now().toString()}.zip`;

execSync(`zip -r ${ZIP_PATH} ${FUNCTION_PATH}`, { stdio: "inherit" });
const ABSOLUTE_ZIP_PATH = path.join(__dirname, ZIP_PATH);
const functionCode = fs.readFileSync(ABSOLUTE_ZIP_PATH);
const functionName = process.env.LAMBDA_FUNCTION_NAME;
// Set up parameters
const params = {
  FunctionName: functionName,
  ZipFile: functionCode,
  //   Publish: true // Set to true if you want to publish a new version of the function
};

// Create or update the Lambda function
lambda.listFunctions({}, (err, data) => {
  console.log(data);
  const arn = data.Functions.find(
    (lambdaFunction) => lambdaFunction.FunctionName == params.FunctionName
  )?.FunctionArn;
  params.FunctionName = arn;
  lambda.updateFunctionCode(params, (err, data) => {
    if (err) {
      console.error("Error updating Lambda function:", err);
    } else {
      console.log("Lambda function updated successfully:", data);
    }
    fs.unlinkSync(ABSOLUTE_ZIP_PATH);
  });
});
