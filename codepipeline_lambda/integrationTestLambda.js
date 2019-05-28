let AWS = require('aws-sdk');
let http = require('http');
let ecs = new AWS.ECS();
let ec2 = new AWS.EC2();

exports.handler = async (event, context) => {
    
    var codepipeline = new AWS.CodePipeline();
    
    // Retrieve the Job ID from the Pipe action
    var jobId = event["CodePipeline.job"].id;
    
    var pubIp = await getPublicIpForCluster( "hello-cloud-int" );
    var url   = `http://${pubIp}:8080/hello`;
    
    console.log( "Here is the url: " + url );

    var connected = false;
    
    // This is needed incase pipeline doesn't wait for the app to start
    // before moving on to the next pipeline stage.
    while( !connected ){
        var result = await waitForHttp( url );
        connected = result.body.includes("ECONNREFUSED") ? false : true;
    }
    
    if( result.body.includes("Add an attribute to the session") ){
        console.log("SUCCESS: loaded web page! Notifying Job: " + jobId);
        await codepipeline.putJobSuccessResult( {jobId: jobId} ).promise();
        console.log("Updated the pipeline with success!");
    } else {
        var failMessage = "Failed to load web page!"
        console.log( failMessage );
        
        var params = {
            jobId: jobId,
            failureDetails: {
                message: failMessage,
                type: 'JobFailed',
                externalExecutionId: context.invokeid
            }
        };
        await codepipeline.putJobFailureResult( params ).promise();
        console.log("Updated the pipeline with failure!");
        /*
        codepipeline.putJobFailureResult(params, function(err, data) {
            context.fail( failMessage );      
        });
        */
    }
    
    return result.statusCode;
};

async function waitForHttp( url ){
    return new Promise((resolve, reject) => {
            
        http.get( url, (response) => {
            let body = '';
            response.on( 'data', (chunk) => {
                body += chunk;
            });
        
            response.on('end', () => {
                console.log( "Received from GET: " + body );
                const response = {
                    statusCode: 200,
                    body: body
                };
                resolve(response);
            });
        }).on("error", (err) => {
            console.log("Error: " + err.message);
            const response = {
                body: err.message,
                statusCode: 500
            };
            
            reject(response);
        });
    });
}

// Thanks to:
// https://medium.com/aws-factory/update-ip-address-in-route53-on-ecs-fargate-redeployments-a19e54e39ec5
async function getPublicIpForCluster(clusterName) {
    // lists tasks of cluster
    let data = await ecs.listTasks({
        cluster: clusterName
    }).promise();
    let taskId = data.taskArns[0].split("/")[1];

    // get Task data
    data = await ecs.describeTasks({
        cluster: clusterName,
        tasks: [
            taskId
        ]
    }).promise();
    let eniId = "";

    // extract "Elastic Network Interface" ENI Id
    let detailsArray = data.tasks[0].attachments[0].details;
    for (let i = 0; i < detailsArray.length; i++) {
        if (detailsArray[i].name === "networkInterfaceId") {
            eniId = detailsArray[i].value;
            break;
        }
    }

    // get Public IP of the extracted ENI
    data = await ec2.describeNetworkInterfaces({
        NetworkInterfaceIds: [
            eniId
        ]
    }).promise();

    return data.NetworkInterfaces[0].PrivateIpAddresses[0].Association.PublicIp;
}
