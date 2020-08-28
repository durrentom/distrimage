'use strict';

const BUCKET = 'site-digitalpainting.school';
const DOMAIN = 'digitalpainting.school';
const TARGET_REGION = 'eu-central-1';
const BASE_URL = 'https://' + DOMAIN;

const axios = require('axios');
const querystring = require('querystring');

const AWS = require('aws-sdk');
const S3 = new AWS.S3({
    signatureVersion: 'v4',
    region: TARGET_REGION,
});
const Sharp = require('sharp');

exports.handler = (event, context, callback) => {
    let response = event.Records[0].cf.response;
    
    console.log("Response status code :%s", response.status);

    //check if image is not present
    if (response.status == 404 || response.status == 403) {
        
        let request = event.Records[0].cf.request;
        let params = querystring.parse(request.querystring);
        
        console.log("PARAMS", params);
        console.log("Request object", JSON.stringify(request));
        console.log("Request querystring", JSON.stringify(request.querystring));

        // read the required path. Ex: uri /images/100x100/webp/image.jpg
        let path = request.uri;

        // read the S3 key from the path variable.
        // Ex: path variable /images/100x100/webp/image.jpg
        let key = path.substring(1);
        
        // if there is no dimension attribute, just pass the response
        if (!params.d) {
            console.log("NO DIMENSIONS, RETURN");
            const fileExt = key.split('?').shift().split('.').pop();

            fetchImage(BASE_URL + request.uri)
            .then(({ data }) => storeOnS3AndReturn(data, BUCKET, key, fileExt, response))
            .then(response => callback(null, response))
            .catch( err => {
                console.log("Exception while reading source image", err);
                response.body = '';
                response.statusDescription = 'Not Found';
                response.status = 404
                callback(null, response);    
            });
            return;
        }

        // parse the prefix, width, height and image name
        // Ex: key=images/200x200/webp/image.jpg
        let prefix, originalKey, match, width, height, requiredFormat, imageName;
        
        try {
            match = key.match(/(.*)\/(\d+)x(\d+)\/(.*)\/(.*)/);
            prefix = match[1];
            width = parseInt(match[2], 10);
            height = parseInt(match[3], 10);
            
            // correction for jpg required for 'Sharp'
            requiredFormat = match[4] == "jpg" ? "jpeg" : match[4];
            imageName = match[5];
            originalKey = prefix + "/" + imageName;
        }
        catch (err) {
            // no prefix exist for image..
            console.log("no prefix present..");
            match = key.match(/(\d+)x(\d+)\/(.*)\/(.*)/);
            width = parseInt(match[1], 10);
            height = parseInt(match[2], 10);
            
            // correction for jpg required for 'Sharp'
            requiredFormat = match[3] == "jpg" ? "jpeg" : match[3]; 
            imageName = match[4];
            originalKey = imageName;
        }
        
        // get the source image file
        const url = BASE_URL + '/' + originalKey

        fetchImage(url)
        .then(({ data }) => Sharp(data) // perform the resize operation
            .resize(width, height)
            .toFormat(requiredFormat)
            .toBuffer()
        )
        .then(buffer => storeOnS3AndReturn(buffer, BUCKET, key, requiredFormat, response))
        .then(response => callback(null, response))
        .catch( err => {
            console.log("Exception while reading source image", err);
            response.body = '';
            response.statusDescription = 'Not Found';
            response.status = 404
            callback(null, response);    
        });
    } // end of if block checking response statusCode
    else {
        // allow the response to pass through
        callback(null, response);
    }
};

const fetchImage = (url) => {
    return axios.get(url, {responseType: 'arraybuffer'})
}

const storeOnS3AndReturn = (buffer, bucket, key, requiredFormat, response) => {
    // save the resized object to S3 bucket with appropriate object key.
    S3.putObject({
        Body: buffer,
        Bucket: bucket,
        ContentType: 'image/' + requiredFormat,
        CacheControl: 'max-age=31536000',
        Key: key,
        StorageClass: 'STANDARD'
    }).promise()
    // even if there is exception in saving the object we send back the generated
    // image back to viewer below
    .catch(() => { console.log("Exception while writing resized image to bucket")});

    // generate a binary response with resized image
    response.status = 200;
    response.body = buffer.toString('base64');
    response.bodyEncoding = 'base64';
    delete response.headers['content-encoding'];
    response.headers['content-type'] = [{ key: 'Content-Type', value: 'image/' + requiredFormat }];

    return response;
}