let activeBlobUrls = {};

function open_download_db() {
    return new Promise(function (resolve, reject) {
        let request = indexedDB.open('octo_weibo_album_downloads', 1);
        request.onupgradeneeded = function () {
            let db = request.result;
            if (!db.objectStoreNames.contains('blobs')) {
                db.createObjectStore('blobs');
            }
        };
        request.onsuccess = function () {
            resolve(request.result);
        };
        request.onerror = function () {
            reject(request.error || new Error('IndexedDB open failed'));
        };
    });
}

function idb_get_blob(key) {
    return open_download_db().then(function (db) {
        return new Promise(function (resolve, reject) {
            let tx = db.transaction('blobs', 'readonly');
            let store = tx.objectStore('blobs');
            let request = store.get(key);
            request.onsuccess = function () {
                let item = request.result;
                resolve(item && item.blob ? item.blob : null);
            };
            request.onerror = function () {
                reject(request.error || new Error('IndexedDB read failed'));
            };
            tx.oncomplete = function () {
                db.close();
            };
        });
    });
}

function idb_delete_blob(key) {
    return open_download_db().then(function (db) {
        return new Promise(function (resolve, reject) {
            let tx = db.transaction('blobs', 'readwrite');
            let store = tx.objectStore('blobs');
            let request = store.delete(key);
            request.onsuccess = function () {
                resolve(true);
            };
            request.onerror = function () {
                reject(request.error || new Error('IndexedDB delete failed'));
            };
            tx.oncomplete = function () {
                db.close();
            };
        });
    });
}

function revoke_download_url(url, key) {
    if (!url) {
        return;
    }
    URL.revokeObjectURL(url);
    delete activeBlobUrls[url];
    if (key) {
        idb_delete_blob(key).catch(function () {});
    }
}

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || (
        message.type !== 'octo_offscreen_ping' &&
        message.type !== 'octo_prepare_blob_url' &&
        message.type !== 'octo_release_blob_url'
    )) {
        return;
    }
    if (message.type === 'octo_offscreen_ping') {
        sendResponse({ok: true});
        return;
    }
    if (message.type === 'octo_release_blob_url') {
        revoke_download_url(message.url, message.key);
        sendResponse({ok: true});
        return;
    }
    idb_get_blob(message.key).then(function (blob) {
        if (!blob) {
            throw new Error('Download blob missing');
        }
        return blob;
    }).then(function (blob) {
        let url = URL.createObjectURL(blob);
        activeBlobUrls[url] = {
            url: url,
            key: message.key,
            time: (new Date()).getTime()
        };
        sendResponse({ok: true, url: url});
    }).catch(function (e) {
        sendResponse({ok: false, error: e && e.message ? e.message : e});
    });
    return true;
});
