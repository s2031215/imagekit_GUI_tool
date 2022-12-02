// main.js

// Modules to control application life and create native browser window
const { app, BrowserWindow, shell, ipcMain, dialog } = require('electron')
const path = require('path')

//Call the home make image.js to upload the image (BUG: Cannot fetch run in frontend??)
const { singleimageconvert, checkconfig, setconfig, loadfileconfig, clearcache, savecloud } = require('./image.js');


//set the app path
if (process.env.ELECTRON_IS_DEV == 0) {
  var rootpath = __dirname; //dev mode
} else if (process.env.PORTABLE_EXECUTABLE_DIR) {
  var rootpath = process.env.PORTABLE_EXECUTABLE_DIR; //PORTABLE mode
} else {
  var rootpath = app.getPath("exe"); //Package mode
}

const createapiWindow = () => {
  const apiWindow = new BrowserWindow({
    width: 300,
    height: 325,
    autoHideMenuBar: true,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      //preload: path.join(__dirname, './input_box/input.js')
    }
  })

  //open imagekit api page in browers
  apiWindow.webContents.setWindowOpenHandler(({ url }) => {
    console.log("new window", url)
    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }
    return { action: 'deny' };
  });

  apiWindow.loadFile('./input_box/input_box.html')
  if (process.env.ELECTRON_IS_DEV == 0) {
    apiWindow.webContents.openDevTools()
  }

}

const createWindow = () => {
  // Create the browser window.
  const mainWindow = new BrowserWindow({
    width: 400,
    height: 630,
    autoHideMenuBar: true,
    show: false,
    webPreferences: {
      webSecurity: false,
      nodeIntegration: true,
      contextIsolation: false,
      preload: path.join(__dirname, 'preload.js')
    }
  })

  //open image in browers
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {

    if (url.startsWith('https:')) {
      shell.openExternal(url);
    }

    return { action: 'deny' };
  });


  // and load the index.html of the app.
  mainWindow.loadFile('index.html')

  mainWindow.webContents.on('did-finish-load', function () {
    mainWindow.show();
  });

  // Open the DevTools. (debug only)
  if (process.env.ELECTRON_IS_DEV == 0) {
    mainWindow.webContents.openDevTools()
  }
}

// This method will be called when Electron has finished
// initialization and is ready to create browser windows.
// Some APIs can only be used after this event occurs.
app.whenReady().then(() => {


  //loading page when api is checking
  var loadingWindow = new BrowserWindow({
    width: 200,
    height: 200,
    transparent: (process.platform != 'linux'), // Transparency doesn't work on Linux.
    resizable: false,
    frame: false,
    //alwaysOnTop: true,
    hasShadow: false,
    title: "Loading..."
  });
  loadingWindow.loadURL('file://' + __dirname + '/img/loadingAnimation_200px.gif');
  //check the api is seted
  try {
    checkconfig().then(result => {
      if (!result) {
        dialog.showErrorBox('Error', 'Your api key is not correct, please set the key first');
        createapiWindow()
      } else {
        createWindow()
      }
      loadingWindow.close();
    })
  } catch (error) {
    dialog.showErrorBox("error", error)
  }

  app.on('activate', () => {
    // On macOS it's common to re-create a window in the app when the
    // dock icon is clicked and there are no other windows open.
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

// Quit when all windows are closed, except on macOS. There, it's common
// for applications and their menu bar to stay active until the user quits
// explicitly with Cmd + Q.
app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})

// In this file you can include the rest of your app's specific main process
// code. You can also put them in separate files and require them here.

//ipcMain handler
ipcMain.handle('image-process', async (event, arg) => {
  console.log(
    arg
  );
  let id = arg.id

  var { oldsize, newsize, spend, url } = await singleimageconvert(arg.name, arg.path, rootpath + '/downloads/', "webp", BrowserWindow.fromWebContents(event.sender), id)
  console.log(oldsize, newsize, spend, url)
  return { id, oldsize, newsize, spend, url }
  //console.log("Main:",result)
});


ipcMain.on('click-upload-window', (event, arg) => {
  dialog.showOpenDialog({
    properties: ['openFile', 'multiSelections'],
    filters: [
      { name: 'Images', extensions: ['jpg', 'png'] }
    ]
  }).then(result => {
    if (!result.canceled) {
      for (const f of result.filePaths) {
        console.log(f)
        BrowserWindow.fromWebContents(event.sender).webContents.send('click-upload-load', f);
      }
    }

  }).catch(err => {
    console.log(err)
  })

});

ipcMain.on('click-open-setting', async (event, arg) => {
  createapiWindow()
});

ipcMain.handle('set-apikey', async (event, arg) => {
  console.log(arg)
  await setconfig(arg.pubkey, arg.prikey, arg.url).then(result => {
    if (!result) {
      dialog.showErrorBox('Error', 'Your api key is not correct, please try again');
    } else {
      BrowserWindow.fromWebContents(event.sender).close()
      //console.log(BrowserWindow.getAllWindows().length)
      if (BrowserWindow.getAllWindows().length == 1) {
        createWindow()
      }
    }
  })
  return 'done'
})

ipcMain.handle('clear-cache', async (event, arg) => {
  console.log("main:cleancache")
  return await clearcache()
})

ipcMain.on('set-savecloud', async (event, arg) => {
  console.log("main:savecloud")
  savecloud(arg)
})

ipcMain.on('get-apikey-config', (event, arg) => {
  var config = loadfileconfig()
  console.log("Main:get-apikey-config", config)
  event.returnValue = config
})




/* base logic for image trigger
index.html  - (from dragover )                            -> # preload.js (render table) -> main.js -> image.js
            -(from window dialog)-> main.js(open window)  -> same as above ^

          preload.js (@@image_process) => main.js
          #render table in html
          #pass the data to backend via @@ipcRenderer

          main.js (@@singleimageconvert) => image.js
          #Main backend script
          #handle window reload function
          #call the frondend via @@ipcRenderer
          #call the image api via @@singleimageconvert

          image.js
          #image process
          #call the preload.js with process when get the file size in middle
          #returm to main.js with finish image process

*/

