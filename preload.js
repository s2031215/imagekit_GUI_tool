// preload.js

// All the Node.js APIs are available in the preload process.
// It has the same sandbox as a Chrome extension.

//PromiseQueue for image process limit to 50 process same time (100 should be max) 
class PromiseQueue {
    constructor(options = {}) {
        this.concurrency = options.concurrency || 50;
        this._current = 0;
        this._list = [];
    }

    add(promiseFn) {
        this._list.push(promiseFn);
        this.loadNext();
    }

    loadNext() {
        if (this._list.length === 0 || this.concurrency === this._current) return;

        this._current++;
        const fn = this._list.shift();
        const promise = fn();
        promise.then(this.onLoaded.bind(this)).catch(this.onLoaded.bind(this));
    }

    onLoaded() {
        this._current--;
        //console.log('Queue Length: ', this._list.length, ' Loading Count: ', this._current)
        this.loadNext();
    }
}

const queue = new PromiseQueue();


const { ipcRenderer } = require('electron');

document.addEventListener('drop', (event) => {
    event.preventDefault();
    event.stopPropagation();

    for (const f of event.dataTransfer.files) {
        // Using the path attribute to get absolute file path
        image_process(f.name, f.path)
    }
});

function image_process(fname, fpath) {
    //hiddendiv() //add the scroll bar (no need hide to save space)
    console.log('File Path of dragged files: ', fname, fpath)

    let tbodyRef = document.getElementsByClassName("css-output-table")[0].getElementsByTagName('tbody')[0]
    let id = tbodyRef.rows.length
    let Data = {
        id: id,
        name: fname,
        path: fpath
    };

    // Insert a row at the end of table
    let newRow = tbodyRef.insertRow(0);

    // Insert a cell at the end of the row
    let nameCell = newRow.insertCell(0);
    let osizeCell = newRow.insertCell(1);
    let nsizeCell = newRow.insertCell(2);
    let timeCell = newRow.insertCell(3);
    let urlCell = newRow.insertCell(4);
    let statusCell = newRow.insertCell(5);

    // Append a text node to the cell
    nameCell.appendChild(document.createTextNode(fname));

    let img = new Image();
    img.src = "./img/ajaxloader.gif";
    img.width = 20
    statusCell.className = 'css-status-image';
    statusCell.appendChild(img);

    osizeCell.appendChild(document.createTextNode('-'));
    nsizeCell.appendChild(document.createTextNode('-'));
    timeCell.appendChild(document.createTextNode('-'));
    urlCell.appendChild(document.createTextNode('-'));

    let oldsize;

    ipcRenderer.once('reply-image-oldsize' + id, (event, arg) => {
        oldsize = arg
        let oldresult;
        if (arg > 1024) { //to MB
            oldresult = Math.round(parseInt(arg) / 102.4) / 10 + ' MB'
        } else {
            oldresult = arg + ' KB'
        }
        osizeCell.replaceChild(document.createTextNode(oldresult), osizeCell.childNodes[0]);
    })


    queue.add(() => new Promise((resolve) => {
        ipcRenderer.invoke('image-process', Data).then(arg => {
            newsize = parseInt(arg.newsize)
            let diff = Math.round(((newsize - oldsize) / oldsize) * 100).toString() + '%'
            let spend = arg.spend
            let url = arg.url
            let newresult;
            if (newsize > 1024) { //to MB
                newresult = Math.round(parseInt(newsize) / 102.4) / 10 + ' MB'
            } else {
                newresult = newsize + ' KB'
            }
            nsizeCell.replaceChild((document.createTextNode(newresult + " " + diff)), nsizeCell.childNodes[0]);
            timeCell.replaceChild(document.createTextNode(Math.round(spend / 100) / 10 + 's'), timeCell.childNodes[0]);
            img.src = "./img/ok-128.png";
            statusCell.replaceChild(img, statusCell.childNodes[0]);

            let a = document.createElement('a');
            a.setAttribute('href', url);
            a.setAttribute('target', "_blank");
            if (url != "") {
                a.innerHTML = "Link";
            }else{
                a.innerHTML = "-";
            }

            urlCell.replaceChild(a, urlCell.childNodes[0]);
            resolve();
        });
    }));
}

document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
});

document.addEventListener('dragenter', (event) => {
    console.log('File is in the Drop Space');
});

document.addEventListener('dragleave', (event) => {
    console.log('File has left the Drop Space');
});

//recive form main.js
ipcRenderer.on('click-upload-load', (event, arg) => {
    const filepath = arg
    const regex = /([^\\]+)\.(jpg|png)$/g;
    const filename = filepath.match(regex)[0];
    image_process(filename, filepath)
})