const AWS = require("aws-sdk");
const dotenv = require("dotenv");
dotenv.config();
const constants = require("./constants");
const Layer = require("./layer");
const { execSync } = require("child_process");
const fs = require("fs");
const path = require("path");


// Function to get the list of attached roles for a policy
const getAttachedRolesForPolicy = (iam, policyArn) => {
  return new Promise((resolve, reject) => {
    const params = {
      PolicyArn: policyArn
    };
    iam.listEntitiesForPolicy(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Roles);
      }
    });
  });
};

// Function to get the list of policies attached to a user
const listAttachedUserPolicies = (iam, userName) => {
  return new Promise((resolve, reject) => {
    const params = {
      UserName: userName
    };
    iam.listAttachedUserPolicies(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.AttachedPolicies);
      }
    });
  });
};
// Main function to retrieve attached roles for policies associated with a user
const getAttachedRolesForPoliciesOfUser = async (iam, userName) => {
  try {
    const attachedPolicies = await listAttachedUserPolicies(iam, userName);
    const attachedRoles = [];
    for (const policy of attachedPolicies) {
      const roles = await getAttachedRolesForPolicy(iam, policy.PolicyArn);
      attachedRoles.push(...roles);
    }
    return attachedRoles;
  } catch (err) {
    console.error('Error:', err);
    throw err;
  }
};


const listAttachedGroupRoles = (iam, groupName) => {
  return new Promise((resolve, reject) => {
    const params = {
      GroupName: groupName
    };
    iam.listAttachedGroupPolicies(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.AttachedPolicies);
      }
    });
  });
};

// Function to get the list of groups for a user
const listGroupsForUser = (iam, userName) => {
  return new Promise((resolve, reject) => {
    iam.listGroupsForUser({UserName: userName}, (err, data) => {
      if (err) {
        reject(err);
      } else {
        resolve(data.Groups);
      }
    });
  });
};
// Main function to retrieve attached roles for groups associated with a user
const listRolesForPolicy = (iam, policyArn) => {
  return new Promise((resolve, reject) => {
    const params = {
      PolicyArn: policyArn
    };
    iam.listEntitiesForPolicy(params, (err, data) => {
      if (err) {
        reject(err);
      } else {
        const roles = data.PolicyRoles;
        resolve(roles);
      }
    });
  });
};
const checkLambdaRoleExists = async (roleName) => {
  try {
    const params = {
      RoleName: roleName
    };
    await iam.getRole(params).promise();
    return true; // Role exists
  } catch (err) {
    if (err.code === 'NoSuchEntity') {
      return false; // Role does not exist
    } else {
      throw err;
    }
  }
};

const getAttachedRolesForGroupsOfUser = async (iam, userName) => {
  try {
    const groups = await listGroupsForUser(iam, userName);
    const policies = [];
    for (const group of groups) {
      const roles = await listAttachedGroupRoles(iam, group.GroupName);
      policies.push(...roles);
    }
    const roles = []
    for (const policy of policies) {
      const policyRoles = await listRolesForPolicy(iam, policy.PolicyArn);
      roles.push(...policyRoles);
    }
    return roles
  } catch (err) {
    console.error('Error:', err);
    throw err;
  }
};



const createLambdaFunction = async (awsLambdaConfig,{
  zipFile,
  functionName,
  layerVersionArn  
}) => {
  try {
    const iam = new AWS.IAM(awsLambdaConfig);
    const userData = await iam.getUser().promise();
    const userName = userData.User.UserName;
    let roles = await getAttachedRolesForPoliciesOfUser(iam, userName);
    if(!roles?.length) {
      console.log('no role found attached to user');
      roles = await getAttachedRolesForGroupsOfUser(iam, userName);
      if(!roles?.length) {
        console.log('no role found attached to user groups');
        return;
      }
    }
    // 
    
    const params = {
      Code: {
        // Specify your function code here
        ZipFile: zipFile, // Replace YOUR_FUNCTION_CODE_BUFFER with the buffer containing your function code
      },
      FunctionName: functionName, // Replace 'your-function-name' with the name for your Lambda function
      Handler: "index.handler", // Specify the entry point for your Lambda function code
      Runtime: "nodejs18.x", // Specify the runtime for your Lambda function
      Description: "Lambda function created from CLI", // Optional: Add a description for your Lambda function
      Timeout: 60, // Specify the timeout for your Lambda function in seconds
      MemorySize: 256, // Specify the memory size for your Lambda function in megabytes
      Role: 'arn:aws:iam::aws:policy/AdministratorAccess', // Specify the role for your Lambda function
      ...(layerVersionArn && { Layers: [layerVersionArn] }),
    };
    
    const lambda = new AWS.Lambda(awsLambdaConfig);
    const data = await lambda.createFunction(params).promise();
    return {
      success: "created",
      data,
    };
  } catch (error) {
    console.error("Error creating Lambda function:", error);
    return {
      success: false,
    };
  }

  
}
const updateLambda = ({ awsLambdaConfig, functionName, layerVersionArn }) => {
  return new Promise((resolve, reject) => {
    AWS.config.update({ region: awsLambdaConfig.region });
    AWS.config.credentials.accessKeyId = awsLambdaConfig.accessKeyId;
    AWS.config.credentials.secretAccessKey = awsLambdaConfig.secretAccessKey;
    const lambda = new AWS.Lambda(awsLambdaConfig);
    // Read the code of your Lambda function
    const ZIP_PATH = `${Date.now().toString()}.zip`;

    execSync(`zip -r ${ZIP_PATH} .`, { stdio: "inherit" });
    const currentDir = process.cwd();
    const ABSOLUTE_ZIP_PATH = path.join(currentDir, ZIP_PATH);
    const functionCode = fs.readFileSync(ABSOLUTE_ZIP_PATH);
    // Set up parameters
    const params = {
      FunctionName: functionName,
      ZipFile: functionCode,
      //   Publish: true // Set to true if you want to publish a new version of the function
    };

    // Create or update the Lambda function
    lambda.listFunctions({}, async (err, data) => {
      if (err) {
        console.error("Error listing Lambda functions:", err);
        fs.unlinkSync(ABSOLUTE_ZIP_PATH);
        reject(err);
        return;
      }
      const arn = data.Functions.find(
        (lambdaFunction) => lambdaFunction.FunctionName == params.FunctionName
      )?.FunctionArn;
      params.FunctionName = arn;
      if(!arn) {
        // const createLambda = await createLambdaFunction(awsLambdaConfig, {
        //   zipFile: functionCode,
        //   functionName,
        //   layerVersionArn
        // });
        console.log('Lambda function not found on AWS account, please login to console and create one');
        fs.unlinkSync(ABSOLUTE_ZIP_PATH);
        // resolve(createLambda);
        return;
      }
      lambda.updateFunctionCode(params, (err, data) => {
        if (err) {
          console.error("Error updating Lambda function:", err);
          fs.unlinkSync(ABSOLUTE_ZIP_PATH);
          reject(err);
        } else {
          console.log("Lambda function updated successfully");
          if(layerVersionArn) {
            console.log('Updating Lambda function configuration')
            lambda.updateFunctionConfiguration({
              FunctionName: arn,
              Layers: [layerVersionArn]
            }, (err, data) => {
              if (err) {
                console.error("Error updating Lambda function configuration:", err);
                fs.unlinkSync(ABSOLUTE_ZIP_PATH);
                reject(err);
              } else {
                console.log("Lambda function configuration updated successfully");
                fs.unlinkSync(ABSOLUTE_ZIP_PATH);
                resolve(data)
              }
            });
          } else {
            fs.unlinkSync(ABSOLUTE_ZIP_PATH);
            resolve(data);
          }
        }
      });
    });
  });
};

module.exports.uploadLambda = async () => {
  const currentPath = process.cwd();
  let layerUpload = await Layer.uploadLayer();
  if(layerUpload?.version) {
    console.log('Layer version uploaded successfully: ', layerUpload.version);
  } else {
    layerUpload = {};
  }
  const fileName = "function_info.json";
  if (fs.existsSync(fileName)) {
    console.log(`File '${fileName}' exists in the current directory.`);
  } else {
    console.log(`File '${fileName}' does not exist in the current directory.`);
    return;
  }
  process.chdir(currentPath);
  const functionInfo = JSON.parse(fs.readFileSync(fileName));
  if (!functionInfo) {
    console.error("Function name not found");
    return;
  }
  const accessInfoPath = `${path.join(
    __dirname,
    constants.AWS_INFO_PATH
  )}.json`;
  if (!fs.existsSync(accessInfoPath)) {
    console.error(
      `File '${accessInfoPath}' does not exists in the current directory.`
    );
    return;
  }
  const awsLambdaConfig = JSON.parse(fs.readFileSync(accessInfoPath));
  if (!awsLambdaConfig) {
    console.error("AWS Lambda config not found");
    return;
  }
  console.log("Function name: ", functionInfo.functionName);
  const lambdaUpload = await updateLambda({
    awsLambdaConfig, 
    functionName: functionInfo.functionName,
    layerVersionArn: layerUpload.layerVersionArn
  });
  if(lambdaUpload.FunctionArn) {
    console.log('Lambda function updated successfully: ', lambdaUpload.FunctionArn);
    if(lambdaUpload.Layers) {
      console.log(
        "Lambda function layers updated successfully: ",
        lambdaUpload.Layers.map((layer) => layer.Arn)
      );
    }
  } else {
    console.error('Error updating Lambda function');
  }
};
