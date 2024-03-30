#!/usr/bin/env node

const yargs = require("yargs/yargs");
const { hideBin } = require("yargs/helpers");
const Utils = require("./utils");
const constants = require("./constants");
const prompt = require("prompt-sync")();
const path = require("path");
const { uploadLambda } = require("./lambda_function");
const AWS_INFO_PATH = `${path.join(__dirname, constants.AWS_INFO_PATH)}.json`;
const loadAwsUser = () => {
  let awsAccountInfo = Utils.readJson(AWS_INFO_PATH);
  if (!awsAccountInfo) {
    awsAccountInfo = {
      accessKeyId: "",
      secretAccessKey: "",
      region: "",
      layerStorageBucket: "",
    };
  }
  return awsAccountInfo;
};
const awsAccountInfo = loadAwsUser();

yargs(hideBin(process.argv))
  .command(
    "setup",
    "setup usage",
    (yargs) => {
      return yargs.positional("user", {
        describe: "setup usage",
      });
    },
    (argv) => {
      try {
        awsAccountInfo.accessKeyId = prompt("AWS Access Key ID: ");
        awsAccountInfo.secretAccessKey = prompt("AWS Secret Access Key: ");
        awsAccountInfo.region = prompt("AWS Region: ");
        awsAccountInfo.layerStorageBucket = prompt(
          "S3 Bucket for storing layer: "
        );

        Utils.saveJson(awsAccountInfo, AWS_INFO_PATH);
        console.info("Access info saved");
      } catch (error) {
        console.error("Error in saving file", error);
      }
    }
  )
  .command(
    "init <function_name>",
    "function name",
    (yargs) => {
      return yargs.positional("files", {
        describe: "name of the lambda function",
      });
    },
    (argv) => {
      // console.info(argv);
      Utils.createFolder(argv.function_name);
    }
  )
  .command(
    "deploy",
    "deploy function",
    (yargs) => {
      return yargs.positional("deploy", {
        describe: "deploy function",
      });
    },
    (argv) => {
      uploadLambda()
    }
  )
  .parse();
