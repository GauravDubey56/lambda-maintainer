

module.exports = async (event) => {
    console.log('Lambda function invoked');
    console.log('event: ', event)
    return {
        statusCode: 200
    }
}