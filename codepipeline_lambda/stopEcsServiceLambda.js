let AWS = require('aws-sdk');
let ecs = new AWS.ECS();

exports.handler = async (event, context) => {
    var codepipeline = new AWS.CodePipeline();
    
    // Retrieve the Job ID from the Pipeline action
    var jobId = event["CodePipeline.job"].id;
    
    var serviceName = event["CodePipeline.job"].data.actionConfiguration.configuration.UserParameters;
    console.log("service name: " + serviceName );
    
    var params = {
        desiredCount: 0, 
        service: serviceName,
        cluster: "hello-cloud-int"
    };
    
    try{
        console.log("Updating service...");
        await ecs.updateService(params).promise();
        console.log("Done Updating service, pass the pipeline action...");
        await codepipeline.putJobSuccessResult( {jobId: jobId} ).promise();
        console.log("Pipeline updated with success");
    } catch( ex ) {
        console.log("Exeception updating service: " + ex.message );
        var failMessage = "Unable to update service.";
        var params = {
            jobId: jobId,
            failureDetails: {
                message: failMessage,
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        await codepipeline.putJobFailureResult( params ).promise();
    }
    
    const response = {
        statusCode: 200,
        body: JSON.stringify('Update Service Action Complete.'),
    };
    
    console.log("Sending response...");
    return response;
};

