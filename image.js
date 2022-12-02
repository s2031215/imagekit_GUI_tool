const ImageKit = require("imagekit");
const fs = require("fs");
const Downloader = require("nodejs-file-downloader");

//unlock the upload to 25mb
const followRedirects = require('follow-redirects');
followRedirects.maxRedirects = 10;
followRedirects.maxBodyLength = 25 * 1024 * 1024; // 25 MB

var setup = false; //check the api config in ready
var imagekit; //imagekit obj

var saveOncloud = false;

//get the app path
if (process.env.ELECTRON_IS_DEV == 0) {
    var rootpath = __dirname; //dev mode
} else if (process.env.PORTABLE_EXECUTABLE_DIR) {
    var rootpath = process.env.PORTABLE_EXECUTABLE_DIR; //PORTABLE mode
} else {
    var rootpath = "."; //Package mode
}

//Function for fs readfile 
async function listFiles(imagekitobj) {
    return await imagekitobj.listFiles({
        skip: 10,
        limit: 10
    }).then(response => {
        console.log(response);
        return true
    }).catch(error => {
        console.log(error);
        return false
    });
}

//Function for fs readfile 
async function readfile(path) {
    var imgdata;
    await fs.promises.readFile(path, function (error, data) {
        if (error) {
            console.log(error);
        }
    }).then(data => {
        //Test the file is load
        //console.log(data);
        imgdata = data
    })

    return imgdata

}
//Function for imagekit upload
async function uploadimage(filename, data) {
    var uploadResponse;
    console.log("start uploadimage", filename, data)
    var result = await imagekit.upload({
        file: data, //required
        fileName: filename,   //required
        folder: "/imagekit_local_app/"
    }).then(response => {
        console.log(response)
        uploadResponse = response
    }).catch(error => {
        console.log(filename, error);
    });
    console.log(result)
    return uploadResponse
}
//Function for imagekit get the url with api
function geturl(filename, format) {
    console.log("geturl...");
    var imageURL = imagekit.url({
        path: "/imagekit_local_app/" + filename,
        urlEndpoint: imagekit.options.urlEndpoint,
        transformation: [{
            "q": "80",
            "format": format
        }]
    });
    return imageURL;
}

//Function for downloadfile get image
async function downloadfile(url, filename, outFolder, format) {
    console.log("downloadfile...");
    //check out folder exit
    if (!fs.existsSync(outFolder)) {
        fs.mkdirSync(outFolder, { recursive: true });
    }
    const downloader = new Downloader({
        url: url,
        directory: outFolder,
        fileName: filename.replace(/\.\w+/i, "." + format), //This will be the file name.
        onBeforeSave: (deducedName) => {
            //console.log(`The image file: ${deducedName} converted`);
            //If you return a string here, it will be used as the name(that includes the extension!).
        },
    });
    try {
        const { filePath, downloadStatus } = await downloader.download(); //Downloader.download() resolves with some useful properties.
        return filePath
        //console.log("All done");
    } catch (error) {
        //IMPORTANT: Handle a possible error. An error is thrown in case of network errors, or status codes of 400 and above.
        //Note that if the maxAttempts is set to higher than 1, the error is thrown only if all attempts fail.
        console.log("Download file " + filename.replace(/\.\w+/i, "." + format) + " failed", error);
    }
}

//Function for compare file size
async function getimagesize(filepath) {
    console.log("getimagesize...");
    var file = await fs.promises.stat(filepath)
    var filesize = Math.round(file.size / 1024)
    return filesize
}

function remveimage(file_id) {
    console.log("remveimage...");
    imagekit.deleteFile(file_id, function (error, result) {
        if (error) console.log(error);
        else console.log(result);
    });
}

//call function
module.exports.checkconfig = async function () {

    var apiconfig = module.exports.loadfileconfig()
    //console.log(apiconfig);
    imagekit = new ImageKit({
        publicKey: apiconfig.publicKey,
        privateKey: apiconfig.privateKey,
        urlEndpoint: apiconfig.urlEndpoint
    });

    setup = await listFiles(imagekit)

    return setup
}

module.exports.loadfileconfig = function () {
    //init conifg file
    if (!fs.existsSync(rootpath + '/config.json')) {
        var default_config = {
            "publicKey": "public_XXXXXXXXXXXXX",
            "privateKey": "private_XXXXXXXXXXXXX",
            "urlEndpoint": "https://ik.imagekit.io/XXX",
            "Comment": "You can get the Key in https://imagekit.io/dashboard/developer/api-keys"
        }
        fs.writeFileSync(rootpath + '/config.json', JSON.stringify(default_config, null, 4));
        return default_config
    }
    return JSON.parse(fs.readFileSync(rootpath + "/config.json", 'utf-8'));
}

module.exports.setconfig = async function (pubkey, prikey, url) {

    imagekit = new ImageKit({
        publicKey: pubkey,
        privateKey: prikey,
        urlEndpoint: url
    });

    setup = await listFiles(imagekit)

    if (setup) {
        //api checked , save the api key to file
        var default_config = {
            "publicKey": pubkey,
            "privateKey": prikey,
            "urlEndpoint": url,
        }
        fs.writeFileSync(rootpath + '/config.json', JSON.stringify(default_config, null, 4));
    }

    return setup
}

module.exports.clearcache = async function () {
    return await imagekit.purgeCache(imagekit.options.urlEndpoint + "/imagekit_local_app*").then(response => {
        //console.log(response);
        return response
    }).catch(error => {
        //console.log(error);
        return error
    });
}

module.exports.savecloud = function (check) {
    saveOncloud = check
}


//Main
module.exports.singleimageconvert = async function (file, inputpath, outputFolder, format, mainWindow = -1, id = -1) {
    try {

        console.log('File ' + file + ' start convert');
        const start = performance.now();
        let url;
        var oldsize = await getimagesize(inputpath).then(data => {
            if (mainWindow != -1) {
                mainWindow.webContents.send('reply-image-oldsize' + id, data);
            }
            return data
        })
        var Response = await readfile(inputpath)
            .then(data => {
                console.log("before uploadimage")
                return uploadimage(file, data)
            })
            .then(Response => {
                console.log("before url")
                url = geturl(Response.name, format);
                console.log(url)
                return Response
            })
        var filePath = await downloadfile(url, file, outputFolder, format)
        if (!saveOncloud) {
            remveimage(Response.fileId)
            url = ""
        }
        const end = performance.now();
        const newsize = await getimagesize(filePath)
        const spend = end - start
        console.log("all done")
        return { oldsize, newsize, spend, url }
    } catch (error) {
        console.log(error);
    }

}

//debug function
/*
async function test() {
    var testresult = await module.exports.checkconfig()
    console.log("api key check:", testresult)
    const { oldsize, newsize, spend, url } = await module.exports.singleimageconvert("test.png", "./example/iCxCz68hysY.jpg", './downloads/', "webp")
    console.log(oldsize, newsize, spend, url)
    console.log(await module.exports.clearcache())
}

test()
*/
