'use strict';

const querystring = require('querystring');

const variables = {
    webpExtension: 'webp',
    allowedExtensions: ['jpg', 'jpeg', 'png', 'gif', 'heic', 'ico', 'webp']
};

exports.handler = (event, context, callback) => {
    const request = event.Records[0].cf.request;
    const headers = request.headers;

    // parse the querystrings key-value pairs. In our case it would be d=100x100
    const qsParams = querystring.parse(request.querystring);
    console.log("QS PARAMS", qsParams);

    const params = getParams(qsParams);
    console.log("PARAMS", params);

    // fetch the uri of original image
    let fwdUri = request.uri;

    // parse the prefix, image name and extension from the uri.
    // In our case /images/image.jpg

    const match = fwdUri.match(/(.*)\/(.*)\.(.*)/);

    if(!match) {
        request.status = 404;
        request.statusDescription = 'Not found';
        callback(null, request);
        return;
    }

    let prefix = match[1];
    let imageName = match[2];
    let extension = match[3];

    // check if extension is allowed
    if(!variables.allowedExtensions.indexOf(extension) < 0){
        request.status = 404;
        request.statusDescription = 'Not found';
        callback(null, request);
        return;
    }

    // if there is no dimension attribute, just pass the request
    if(!params.width && !params.height){
        console.log("NO DIMENSIONS");
        callback(null, request);
        return;
    }

    // read the accept header to determine if webP is supported.
    let accept = headers['accept']?headers['accept'][0].value:"";

    let url = [];
    // build the new uri to be forwarded upstream
    url.push(prefix);
    url.push(params.width + "x" + params.height);
  
    // check support for webp
    if (accept.includes(variables.webpExtension)) {
        url.push(variables.webpExtension);
    }
    else{
        url.push(extension);
    }
    url.push(imageName+"."+extension);

    fwdUri = url.join("/");
    
    console.log("FWD URI", fwdUri);
    
    // final modified url is of format /images/200x200/webp/image.jpg
    request.uri = fwdUri;
    callback(null, request);
};

const getParams = (params) => {
    return {
        width: params.w || null,
        height: params.h || null,
    }
}