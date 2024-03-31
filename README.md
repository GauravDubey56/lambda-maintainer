# Lambda Function Utility CLI Tool

Lambda Function Utility CLI Tool is a command-line interface (CLI) tool for initializing and deploying AWS Lambda functions.

## Installation

You can install Lambda Function Utility CLI Tool globally using npm:

```bash
npm install -g lambda-cli-util-tool
```

## Usage

```bash
func setup
````
Prompts user for access keys and saves AWS access info inside a JSON file in package directory on the first usage.

```bash
func init <function_name> <layer_name>
```

Initializes NPM directory with index.js file exporting handler. 

```bash
func deploy
```
Installs node modules from package.json if a layer was mentioned and dependencies are present to deploy a new version to the layer. 
Zips function code and deploys the handler to Lambda and updates Layer version if mentioned.