importScripts('utils/config.js', 'utils/common.js', 'utils/util.js', 'utils/date.js');

var window = self;

console.log('background service worker start', new Date());

function send_popup_message(message, label) {
    chrome.runtime.sendMessage(message, function (res) {
        if (chrome.runtime.lastError) {
            console.log('sendMessage skipped：' + label, chrome.runtime.lastError.message);
            return;
        }
        console.log('sendMessage：' + label, res)
    });
}

var events = {
    album_fail: function (info) {
        send_popup_message({type: 'album_fail', data: info}, 'album_fail');
    },
    album_list: function (list) {
        //获取当前页面链接
        send_popup_message({type: 'album_list', data: list}, 'album_list');
    },
    album_complete: function (data) {
        //获取当前页面链接
        send_popup_message({type: 'album_complete', data: data}, 'album_complete');
    },
    download_status: function (data) {
        send_popup_message({type: 'download_status', data: data}, 'download_status');
    },
    pop_info: function (data) {
        //获取当前页面链接
        send_popup_message({type: 'pop_info', data: data}, 'pop_info');
    }
};

function getCurrentTab(callback = function () {
}) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        console.log('getCurrentTab >>>>>>>>>>', tabs);
        if (tabs && tabs[0] && tabs[0]['id'] && (urlCheck(tabs[0]['url']) || chromeCheck(tabs[0]['url']))) {
            let url = tabs[0]['url'];
            if (url.indexOf('weibo.com')>-1) {
                try {
                    chrome.tabs.sendMessage(tabs[0]['id'], {type: 'tabs', data: tabs[0]}, function (response) {
                        console.log('getCurrentTab response', response);
                        if (!response) {
                            events.album_fail('请在微博页面打开!')
                        }
                        callback(response)
                    })
                } catch (e) {
                    callback(e)
                }
            } else {
                events.album_fail('请在微博页面打开~');
                callback(false)
            }
        } else {
            callback(false)
        }
    })
}

function getCurTab(callback = function () {
}) {
    chrome.tabs.query({active: true, currentWindow: true}, function (tabs) {
        if (tabs && tabs[0] && tabs[0]['id'] && urlCheck(tabs[0]['url'])) {
            let tabId = tabs[0]['id'];
            let url = tabs[0]['url'];
            let status = tabs[0]['status'];
            url = getUrlDomain(url);
            console.log('getCurTab >>>>>', tabId, tabs, url);
            if (status !== 'complete') {
                callback(false);
                console.log('callback fail uncompleted');
            } else if (/.*?(weibo.com).*?/.test(url) && status === "complete") {
                callback(tabId);
                console.log('callback success');
            } else {
                callback(false);
                console.log('callback fail domain match error');
            }
        } else {
            callback(false)
        }
    })
}

// url参数解析
function getUrlParams(url) {
    var params = {};
    var urls = url.split("?");
    if (!urls[1]) {
        return {}
    }
    var arr = urls[1].split("&");
    for (var i = 0, l = arr.length; i < l; i++) {
        var a = arr[i].split("=");
        params[a[0]] = a[1];
    }
    return params;
}


chrome.runtime.onMessage.addListener(function (request, sender, sendResponse) {
    // console.log('onMessage.addListener', request);
    if (request.type === 'current_page') {
        getCurrentTab(function (res) {
            console.log('current_page', res);
            sendResponse(res)
        })
    } else if (request.type === 'down_album') {
        let data = request.data;
        console.log('down_album data', data);
        let uid = data.uid;
        let album_id = data.album_id;
        let caption = data.caption;
        let type = data.type;
        let name = data.name;
        let count = data.count;
        let ratio = data.ratio;
        let open = data.open;
        let down_allow = data.down_allow;
        window['ratio'+album_id] = ratio;
        window['open'+album_id] = open;
        window['download_suc' + album_id] = 0;
        window['download_fail' + album_id] = 0;
        window['timer'+album_id] = 0;
        window['uid'+album_id] = uid;
        window.page = 1;
        window.photo_list_temp = [];
        window['down_allow'] = down_allow;
        window['down_stopped'] = false;
        window['album_stopped_' + album_id] = false;
        set_download_status('running');
        let target_name = clean_user_name(name) || uid;
        if (!window['albumDetail' + album_id]) {
            window['albumDetail' + album_id] = {
                album_id: album_id,
                caption: caption,
                cover_pic: '',
                type: type,
                count: parseInt(count, 10) || 0,
                name: target_name
            };
        } else {
            window['albumDetail' + album_id].name = target_name;
            window['albumDetail' + album_id].caption = window['albumDetail' + album_id].caption || caption;
            window['albumDetail' + album_id].type = window['albumDetail' + album_id].type || type;
        }
        update_album_total(album_id, count);
        let folder = target_name + '_' + caption;
        register_download_session(uid, album_id, type, folder);
        console.log('down_album target folder', {uid: uid, target_name: target_name, caption: caption, folder: folder});
        down_url(uid, album_id, type, folder);
        sendResponse(true)
    } else if (request.type === 'album_get') {
        let info = request.data;
        console.log('album_get data', info);
        window['albumPage' + info.uid] = 1;
        window['albumList' + info.uid] = [];
        album_get(info);
        sendResponse(true)
    } else if (request.type === 'config_get') {
        let key = request.data;
        config_get(key, function (value) {
            console.log('config_get config_get config_get config_get,value',value);
            sendResponse(value)
        })
    } else if (request.type === 'config_set') {
        let data = request.data;
        console.log('config_set config_set config_set config_set')
        config_set(data, function () {
            sendResponse(true)
        });

    } else if(request.type === 'window_get'){
        let data = request.data;
        sendResponse(window[data]);
    } else if(request.type === 'window_set'){
        let data = request.data;
        for(let i in data){
            window[i] = data[i]
        }
        scheduleQueueDrain();
        sendResponse(data);
    } else if(request.type === 'down_cancel'){
        timeoutClear();
        clearQueueSchedule();
        window['down_stopped'] = true;
        set_download_status('stopped');
        sendResponse(get_download_state('stopped'));
    } else if(request.type === 'down_resume'){
        window['down_stopped'] = false;
        let resumed = resume_download_sessions();
        set_download_status(has_active_downloads() || resumed > 0 ? 'running' : 'idle', true);
        scheduleQueueDrain();
        sendResponse(get_download_state(window['download_status']));
    } else if(request.type === 'album_stop'){
        let album_id = request.album_id;
        window['album_stopped_' + album_id] = true;
        clear_album_queue_tasks(album_id);
        sendResponse({album_id: album_id, stopped: true});
    } else if(request.type === 'album_resume'){
        let album_id = request.album_id;
        window['album_stopped_' + album_id] = false;
        let session = (window['downloadSessions'] || {})[album_id];
        if (session && !window['download_finished' + album_id]) {
            down_url(session.uid, session.album_id, session.type, session.folder);
        }
        sendResponse({album_id: album_id, suc: window['download_suc' + album_id] || 0, total: get_album_total(album_id)});
    } else if(request.type === 'album_remove'){
        let album_id = request.album_id;
        clear_album_queue_tasks(album_id);
        window['album_stopped_' + album_id] = true;
        window['download_finished' + album_id] = true;
        if (window['downloadSessions']) {
            delete window['downloadSessions'][album_id];
        }
        delete window['download_suc' + album_id];
        delete window['download_fail' + album_id];
        delete window['albumDetail' + album_id];
        delete window['uid' + album_id];
        delete window['page' + album_id];
        delete window['photo_list_temp' + album_id];
        delete window['redo' + album_id];
        delete window['timer' + album_id];
        sendResponse(true);
    } else if(request.type === 'get_all_progress'){
        let progress = [];
        let sessions = window['downloadSessions'] || {};
        for (let album_id in sessions) {
            let detail = window['albumDetail' + album_id] || {};
            progress.push({
                album_id: album_id,
                uid: window['uid' + album_id] || detail.uid || '',
                caption: detail.caption || '',
                name: detail.name || '',
                cover_pic: detail.cover_pic || '',
                type: detail.type || '',
                suc: window['download_suc' + album_id] || 0,
                fail: window['download_fail' + album_id] || 0,
                total: get_album_total(album_id),
                finished: !!window['download_finished' + album_id],
                stopped: !!window['album_stopped_' + album_id]
            });
        }
        sendResponse(progress);
    }
    return true;
});
function config_get(key, callback){
    chrome.storage.local.get(key, function (res) {
        let value = res && res[key] !== undefined ? res[key] : null;
        typeof callback === 'function' && callback(value);
    });
}
function config_set(data, callback){
    console.log('set set',data);
    chrome.storage.local.set(data, function () {
        typeof callback === 'function' && callback(true);
    });
    return true;
}

function clean_user_name(name) {
    return (name || '').toString().replace(/^@\s*/, '').trim();
}

function photo_album_referrer(uid) {
    return 'https://photo.weibo.com/' + uid + '/albums?rd=1';
}

function photo_detail_referrer(uid, album_id, type) {
    if (type == 3) {
        return 'https://photo.weibo.com/' + uid + '/talbum/index';
    }
    return 'https://photo.weibo.com/' + uid + '/albums/detail/album_id/' + album_id;
}

//获取相册列表
function album_get(info) {
    let uid = info.uid;
    let name = clean_user_name(info.name) || uid.toString();
    window['albumPage' + uid] = window['albumPage' + uid] ? window['albumPage' + uid] : 1;
    window['albumList' + uid] = window['albumList' + uid] ? window['albumList' + uid] : [];

    var url = 'https://photo.weibo.com/albums/get_all';
    let data = {
        uid: uid.toString(),
        page: window['albumPage' + uid].toString(),
        count: '20',
        __rnd: (new Date()).getTime(),
    };
    console.log('album_get', url, data);
    fetch_json(url, data, function (res) {
        let list = [];
        let total;
        if (res.code === 0) {
            list = res.data['album_list'];
            if (list && list.length > 0) {
                for (let i in list) {
                    window['albumDetail' + list[i]['album_id']] = {
                        album_id: list[i]['album_id'],
                        caption: list[i]['caption'],
                        cover_pic: list[i]['cover_pic'],
                        type: list[i]['type'],
                        count: list[i]['count']['photos'],
                        name: name,
                    }
                }
                window['albumList' + uid] = [...window['albumList' + uid], ...list];
                total = res.data['total'];
                if (total > window['albumList' + uid].length && list.length > 10) {
                    window['albumPage' + uid]++;
                    album_get(info)
                } else {
                    console.log("window['albumList'+uid]", window['albumList' + uid]);
                    events.album_list({list: window['albumList' + uid], name: name, uid: uid.toString()})
                }
            } else {
                console.log("window['albumList'+uid]", window['albumList' + uid]);
                if (window['albumList' + uid].length > 0) {
                    events.album_list({list: window['albumList' + uid], name: name, uid: uid.toString()})
                } else {
                    events.album_fail('相册列表为空或不可访问，请确认当前页面用户 UID 是否正确')
                }
            }
        } else {
            events.album_fail('相册列表请求错误，code ' + res.code)
        }
        console.log(res)

    }, function () {
        events.album_fail('相册列表请求没有响应')
    }, photo_album_referrer(uid))
}

let base_folder = 'WeiboAlbum';

function down_url(uid, album_id, type, folder) {
    if (window['album_stopped_' + album_id] || window['down_stopped']) {
        console.log('[download:page:skip:stopped]', {uid: uid, album_id: album_id, type: type, folder: folder});
        return;
    }
    register_download_session(uid, album_id, type, folder);
    let url = 'https://photo.weibo.com/photos/get_all';
    let page;
    let photo_list_temp;
    if (!window['page' + album_id]) {
        window['page' + album_id] = 1;
    }
    page = window['page' + album_id];
    if (!window['photo_list_temp' + album_id]) {
        window['photo_list_temp' + album_id] = [];
    }
    photo_list_temp = window['photo_list_temp' + album_id];
    let data = {
        uid: uid,
        album_id: album_id,
        count: 30,
        page: page,
        type: type,
        __rnd: (new Date()).getTime(),
    };
    console.log('down_url start',uid, album_id, type, folder);
    fetch_json(url, data, function (res) {
        if (window['album_stopped_' + album_id] || window['down_stopped']) {
            console.log('[download:page:ignored:stopped]', {uid: uid, album_id: album_id, page: page});
            return;
        }
        if (res.code === 0) {
            let photo_list = res.data['photo_list'] || [];
            let total = res.data['total'];
            update_album_total(album_id, total);
            let info_list = [];
            let queue;
            console.log('photo_list page', page, photo_list);
            if (photo_list.length > 0) {
                if(window['ratio'+album_id] && window['timer'+album_id] > total*window['ratio'+album_id]){
                    enqueue_download_task({'type':'finish','data':album_id});
                    return;
                }
                window['timer'+album_id] += photo_list.length;
                info_list = photo_list.map((item) => {
                    let link = item['pic_host'] + '/large/' + item['pic_name'];
                    let name_uni = ext(item['pic_name']) ? item['pic_name'] : item['pic_name'] + '.jpg';
                    return {link: link, name: name_uni}
                });
                for (let i in info_list) {
                    setTimeout(function () {
                        queue = [info_list[i]['link'],base_folder + '/' + folder + '/' + info_list[i]['name'], album_id];

                        enqueue_download_task({'type':'down','data':queue});

                    }, 10 * i);
                }
                window['photo_list_temp' + album_id] = [...photo_list_temp, ...info_list];
                window['page' + album_id] = page + 1;
                window['redo' + album_id] = 0;
                timeoutList(setTimeout(function () {
                    if (!window['album_stopped_' + album_id] && !window['down_stopped']) {
                        down_url(uid, album_id, type, folder);
                    }
                }, DELAY_PAGE * 1000));
            } else {
                if (!redo(uid, album_id, type, folder, 1)) {
                    console.log('all photo_list_temp', photo_list_temp);
                    window['page' + album_id] = 1;
                    window['photo_list_temp' + album_id] = [];
                }
            }
    } else {
        redo(uid, album_id, type, folder, 2)
    }
    }, function () {
        if (window['album_stopped_' + album_id] || window['down_stopped']) {
            console.log('[download:page:fail:stopped]', {uid: uid, album_id: album_id, page: page});
            return;
        }
        redo(uid, album_id, type, folder, 3);
    }, photo_detail_referrer(uid, album_id, type))
}

function fetch_json(url, data, success, fail, referrer) {
    let request_url = url + '?' + new URLSearchParams(data).toString();
    let timer = null;
    let controller = new AbortController();

    get_weibo_xsrf_token(function (xsrf_token) {
        let headers = {
            'Accept': '*/*',
            'X-Requested-With': 'XMLHttpRequest',
            'Client-Version': '3.0.0',
            'Content-Type': 'application/x-www-form-urlencoded'
        };
        if (xsrf_token) {
            headers['X-XSRF-TOKEN'] = xsrf_token;
        }

        timer = setTimeout(function () {
            controller.abort();
        }, 15000);
        fetch(request_url, {
            method: 'GET',
            credentials: 'include',
            signal: controller.signal,
            referrer: referrer || 'https://weibo.com/',
            referrerPolicy: 'no-referrer-when-downgrade',
            headers: headers
        }).then(function (res) {
            clearTimeout(timer);
            if (!res.ok) {
                throw new Error('HTTP ' + res.status);
            }
            return res.json();
        }).then(function (json) {
            typeof success === 'function' && success(json);
        }).catch(function (e) {
            clearTimeout(timer);
            console.log('fetch_json fail', request_url, e);
            typeof fail === 'function' && fail(e && e.message ? e.message : 'request error');
        });
    });
}

function get_weibo_xsrf_token(callback) {
    if (!chrome.cookies || !chrome.cookies.get) {
        callback('');
        return;
    }
    chrome.cookies.get({url: 'https://weibo.com/', name: 'XSRF-TOKEN'}, function (cookie) {
        if (chrome.runtime.lastError) {
            console.log('get XSRF-TOKEN fail', chrome.runtime.lastError.message);
            callback('');
            return;
        }
        callback(cookie && cookie.value ? cookie.value : '');
    });
}

let timeoutQueue = new ArrayQueue();
function timeoutList(timeId){
    timeoutQueue.push(timeId)
}
function timeoutClear(){
    let timeId;
    do{
        timeId = timeoutQueue.pop();
        if(timeId){
            clearTimeout(timeId);
        }
    }while (timeId);
}

function redo(uid, album_id, type, folder, code) {
    if (!window['redo' + album_id]) {
        window['redo' + album_id] = 0
    }
    if (window['redo' + album_id] < code) {
        window['redo' + album_id] = window['redo' + album_id] + 1;
        timeoutList(setTimeout(function () {
            if (!window['album_stopped_' + album_id] && !window['down_stopped']) {
                down_url(uid, album_id, type, folder);
            }
        }, DELAY_PAGE * 1000));
        return true;
    } else {
        enqueue_download_task({'type':'finish','data':album_id});
        return false;
    }
}

function update_album_total(album_id, total) {
    total = parseInt(total, 10);
    if (!total || total < 0) {
        return;
    }
    let current = window['albumDetail' + album_id] ? parseInt(window['albumDetail' + album_id].count, 10) : 0;
    if (current && current > total) {
        return;
    }
    if (!window['albumDetail' + album_id]) {
        window['albumDetail' + album_id] = {album_id: album_id, count: total};
    } else {
        window['albumDetail' + album_id].count = total;
    }
}

function get_album_total(album_id) {
    let detail = window['albumDetail' + album_id] || {};
    let total = parseInt(detail.count, 10);
    if (total && total > 0) {
        return total;
    }
    let downloaded = (window['download_suc' + album_id] || 0) + (window['download_fail' + album_id] || 0);
    return downloaded > 0 ? downloaded : 0;
}

function reset_album_info(album_id){
    window['download_finished' + album_id] = true;
    if (window['downloadSessions']) {
        delete window['downloadSessions'][album_id];
    }
    events.album_complete({
        album_id: album_id,
        uid: window['uid' + album_id],
        suc: window['download_suc' + album_id]?window['download_suc' + album_id]:0,
        fail: window['download_fail' + album_id]?window['download_fail' + album_id]:0,
        total: get_album_total(album_id),
        info:'下载完成',
        album_detail: window['albumDetail' + album_id]
    });
    set_download_status(has_active_downloads() ? 'running' : 'complete');
    if (window['download_folder' + album_id] && window['open'+album_id]) {
        show_folder(window['download_folder' + album_id])
    }
    setTimeout(function(){
        window['redo' + album_id] = 0;
        window['page' + album_id] = 1;
        window['photo_list_temp' + album_id] = [];
        window['sinceid' + album_id] = null;
        window['photo_seen' + album_id] = null;
        window['download_suc' + album_id] = -1;
        window['download_fail' + album_id] = -1
    },2000)
}

function show_folder(downloadId) {
    chrome.downloads.show(downloadId)
}

function ext(a) {
    let index = a.lastIndexOf(".");
    if (index > -1) {
        return a.substring(index, a.length);
    } else {
        return '';
    }
}

function reg_filename(str) {
    var reg = new RegExp(/'|#|&| |!|\\|\/|:|\?|"|<|>|\*|\|/g);
    str = str.replace(reg, "");
    return str
}

function normalize_download_filename(path) {
    let parts = (path || '').toString().split('/');
    let normalized = [];
    for (let i in parts) {
        let part = reg_filename(parts[i]);
        if (part) {
            normalized.push(part);
        }
    }
    return normalized.join('/');
}

function basename_from_url(url) {
    if (!url || typeof url !== 'string' || url.indexOf('data:') === 0) {
        return '';
    }
    try {
        let pathname = (new URL(url)).pathname || '';
        let parts = pathname.split('/');
        return decodeURIComponent(parts[parts.length - 1] || '');
    } catch (e) {
        try {
            let clean_url = url.split('#')[0].split('?')[0];
            let parts = clean_url.split('/');
            return decodeURIComponent(parts[parts.length - 1] || '');
        } catch (ignore) {
            return '';
        }
    }
}

function fallback_download_filename(url, album_id) {
    let filename = reg_filename(basename_from_url(url));
    if (!filename) {
        filename = 'download_' + (new Date()).getTime() + (is_weibo_image_url(url) ? '.jpg' : '');
    } else if (is_weibo_image_url(url) && !ext(filename)) {
        filename += '.jpg';
    }
    let album_folder = reg_filename((album_id || 'unknown').toString()) || 'unknown';
    return normalize_download_filename(base_folder + '/' + album_folder + '/' + filename);
}

function build_download_filename(url, name, album_id) {
    let filename = normalize_download_filename(name);
    if (filename) {
        return filename;
    }
    filename = fallback_download_filename(url, album_id);
    console.warn('[download:filename:fallback]', {
        album_id: album_id,
        url: url,
        originalFilename: name,
        fallbackFilename: filename
    });
    return filename;
}

function down(url, name, album_id, callback) {
    // console.log(url, name);
    name = build_download_filename(url, name, album_id);
    let startStamp = (new Date()).getTime();
    if(!window['downCurrent']){
        window['downCurrent'] = 0;
    }
    window['downCurrent'] =  window['downCurrent'] + 1;
    let download_options = {url: url, filename: name, conflictAction: 'overwrite'};
    console.log('[download:start]', {
        album_id: album_id,
        url: url,
        filename: name,
        is_weibo_image: is_weibo_image_url(url),
        queue_length: arrayQueue.length(),
        downCurrent: window['downCurrent']
    });
    if (is_weibo_image_url(url)) {
        download_weibo_image(url, name, album_id, startStamp, callback);
        return;
    }
    download_direct(download_options, url, name, album_id, startStamp, callback);
}

function is_weibo_image_url(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    return /^https?:\/\/[^\/]*(sinaimg|sinajs)\.cn\//i.test(url);
}

function download_weibo_image(url, name, album_id, startStamp, callback) {
    fetch(url, {
        method: 'GET',
        credentials: 'include',
        referrer: 'https://m.weibo.cn/',
        referrerPolicy: 'no-referrer-when-downgrade',
        headers: {
            'Accept': 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8'
        }
    }).then(function (res) {
        let content_type = res.headers.get('content-type') || '';
        console.log('[download:fetch]', {
            album_id: album_id,
            url: url,
            status: res.status,
            content_type: content_type
        });
        if (!res.ok) {
            throw new Error('HTTP ' + res.status);
        }
        if (content_type.indexOf('image/') !== 0) {
            throw new Error('Unexpected content-type ' + content_type);
        }
        return res.blob();
    }).then(function (blob) {
        return blob_to_data_url(blob);
    }).then(function (data_url) {
        let filename_token = queue_data_url_filename(name);
        download_direct({
            url: append_data_url_token(data_url, filename_token),
            filename: name,
            conflictAction: 'overwrite'
        }, url, name, album_id, startStamp, callback);
    }).catch(function (e) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        console.warn('[download:fetch:error]', {
            album_id: album_id,
            url: url,
            filename: name,
            error: e && e.message ? e.message : e
        });
        if(window['download_suc' + album_id] > -1) {
            window['download_fail' + album_id] = window['download_fail' + album_id] + 1;
            events.album_complete({
                album_id: album_id,
                uid: window['uid' + album_id],
                suc: window['download_suc' + album_id],
                fail: window['download_fail' + album_id],
                total: get_album_total(album_id),
                album_detail: window['albumDetail' + album_id]
            });
        }
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

function blob_to_data_url(blob) {
    return blob.arrayBuffer().then(function (buffer) {
        let bytes = new Uint8Array(buffer);
        let binary = '';
        let chunk_size = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk_size) {
            let chunk = bytes.subarray(i, i + chunk_size);
            binary += String.fromCharCode.apply(null, chunk);
        }
        return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(binary);
    });
}

let pendingDataUrlFilenames = {};
let dataUrlFilenameMarker = '#octo_weibo_album_filename=';

function queue_data_url_filename(filename) {
    filename = normalize_download_filename(filename);
    if (!filename) {
        return '';
    }
    let token = 'octo_weibo_album_' + (new Date()).getTime() + '_' + Math.random().toString(36).slice(2);
    pendingDataUrlFilenames[token] = {
        filename: filename,
        time: (new Date()).getTime()
    };
    prune_data_url_filenames();
    return token;
}

function append_data_url_token(data_url, token) {
    if (!token) {
        return data_url;
    }
    return data_url + dataUrlFilenameMarker + encodeURIComponent(token);
}

function data_url_filename_token(url) {
    let index = (url || '').lastIndexOf(dataUrlFilenameMarker);
    if (index < 0) {
        return '';
    }
    try {
        return decodeURIComponent(url.substring(index + dataUrlFilenameMarker.length));
    } catch (e) {
        return '';
    }
}

function take_data_url_filename(item) {
    let token = data_url_filename_token(item && item.url);
    let pending = token ? pendingDataUrlFilenames[token] : null;
    if (pending) {
        delete pendingDataUrlFilenames[token];
    }
    return pending;
}

function prune_data_url_filenames() {
    let now = (new Date()).getTime();
    let tokens = Object.keys(pendingDataUrlFilenames);
    for (let i in tokens) {
        let token = tokens[i];
        if (!pendingDataUrlFilenames[token] || now - pendingDataUrlFilenames[token].time > 10 * 60 * 1000) {
            delete pendingDataUrlFilenames[token];
        }
    }
}

chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    if (!item || !item.url || item.url.indexOf('data:image/') !== 0 || !data_url_filename_token(item.url)) {
        return;
    }
    let pending = take_data_url_filename(item);
    let filename = pending && pending.filename ? normalize_download_filename(pending.filename) : '';
    if (!filename) {
        console.warn('[download:filename:missing]', {
            downloadId: item.id,
            originalFilename: item.filename,
            hasToken: !!data_url_filename_token(item.url),
            pendingCount: Object.keys(pendingDataUrlFilenames).length
        });
        return;
    }
    console.log('[download:filename:suggest]', {
        downloadId: item.id,
        originalFilename: item.filename,
        suggestedFilename: filename
    });
    suggest({filename: filename, conflictAction: 'overwrite'});
    return true;
});

function download_direct(download_options, url, name, album_id, startStamp, callback) {
    chrome.downloads.download(download_options, function (res) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        // if (!window['downTime' + album_id]) {
        //     window['downTime' + album_id] = []
        // }
        // window['downTime' + album_id].push(((new Date()).getTime() - startStamp));
        // if (window['downTime' + album_id].length % 10 === 9)  {
            // if(window['downTime' + album_id].length>0){
                // let time_avg_per = avg(window['downTime' + album_id]);
                // window['downTimeAvgPer' + album_id] = time_avg_per;
                // let time_avg = time_avg_per * 12.5;
                // time_avg = time_avg > 5000 ? time_avg : 5000;
                // window['downTimeAvg' + album_id] = time_avg;
                // events.pop_info({time_avg: time_avg});
                // console.log("time_avg", time_avg);
            // }
        // }
        // if(window['downTime' + album_id].length>=60){
            // window['downTime' + album_id] = window['downTime' + album_id].slice(10);
            // console.log("window['downTime' + album_id]",window['downTime' + album_id]);
            // window['downTime' + album_id].fill(window['downTimeAvgPer' + album_id]);
            // console.log('……………………………………………………length',window['downTime' + album_id].length)
        // }
        if (chrome.runtime.lastError) {
            console.warn('[download:error]', {
                album_id: album_id,
                url: url,
                filename: name,
                error: chrome.runtime.lastError.message
            });
        } else {
            console.log('[download:created]', {
                album_id: album_id,
                downloadId: res,
                url: url,
                filename: name,
                elapsed: (new Date()).getTime() - startStamp
            });
        }
        if (!window['download_folder' + album_id]) {
            window['download_folder' + album_id] = res ? res : null;
        }
        if(window['download_suc' + album_id] > -1) {
            if (res && !chrome.runtime.lastError) {
                window['download_suc' + album_id] = window['download_suc' + album_id] + 1;
            } else {
                window['download_fail' + album_id] = window['download_fail' + album_id] + 1;
            }
            events.album_complete({
                album_id: album_id,
                uid: window['uid' + album_id],
                suc: window['download_suc' + album_id],
                fail: window['download_fail' + album_id],
                total: get_album_total(album_id),
                album_detail: window['albumDetail' + album_id]
            });
        }
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    })
}

chrome.downloads.onChanged.addListener(function (delta) {
    if (delta.error) {
        console.warn('[download:onChanged:error]', {
            downloadId: delta.id,
            error: delta.error.current || delta.error.previous
        });
    }
    if (delta.state) {
        console.log('[download:onChanged:state]', {
            downloadId: delta.id,
            state: delta.state.current || delta.state.previous
        });
    }
    if (delta.filename) {
        let filename = delta.filename.current || delta.filename.previous;
        console.log('[download:onChanged:filename]', {
            downloadId: delta.id,
            filename: filename
        });
        if (/\.html?$/i.test(filename || '')) {
            console.warn('[download:onChanged:html_filename]', {
                downloadId: delta.id,
                filename: filename
            });
        }
    }
});

function ArrayQueue(){
    var arr = [];
    //入队操作
    this.push = function(element){
        arr.push(element);
        return true;
    };
    //出队操作
    this.pop = function(){
        return arr.shift();
    };
    //查看队列
    this.list = function(){
        return arr;
    };
    //查看队列长度
    this.length = function(){
        return arr.length;
    };
    //查看队列长度
    this.reset = function(){
        arr = [];
        return true;
    }
}
let arrayQueue = new ArrayQueue();
downCurrent = 0;
albumList = [];
down_allow = 1;
down_stopped = false;
download_status = 'idle';
downloadSessions = {};
window['queueDrainTimer'] = null;
config_get('down_allow', function (value) {
    down_allow = value !== null ? value : 1;
    config_set({'down_allow':down_allow});
});

function enqueue_download_task(task) {
    arrayQueue.push(task);
    if (task && task.type === 'down' && !window['down_stopped']) {
        set_download_status('running');
    }
    scheduleQueueDrain();
}

function clear_album_queue_tasks(album_id) {
    let kept = [];
    let list = arrayQueue.list();
    for (let i in list) {
        let task = list[i];
        if (task.type === 'down' && task.data && task.data[2] == album_id) {
            continue;
        }
        if (task.type === 'finish' && task.data == album_id) {
            continue;
        }
        kept.push(task);
    }
    arrayQueue.reset();
    for (let i in kept) {
        arrayQueue.push(kept[i]);
    }
}

function has_active_downloads() {
    return window['downCurrent'] > 0 || arrayQueue.length() > 0;
}

function has_resumable_downloads() {
    return arrayQueue.length() > 0 || Object.keys(window['downloadSessions'] || {}).length > 0 || window['downCurrent'] > 0;
}

function get_download_state(status) {
    status = status || window['download_status'] || 'idle';
    return {
        status: status,
        pending: arrayQueue.length(),
        downCurrent: window['downCurrent'] || 0,
        stopped: !!window['down_stopped'],
        canResume: status === 'stopped' && has_resumable_downloads()
    };
}

function set_download_status(status, force) {
    window['download_state'] = get_download_state(status);
    if (!force && window['download_status'] === status) {
        return;
    }
    window['download_status'] = status;
    window['download_state'] = get_download_state(status);
    events.download_status(window['download_state']);
}

function clearQueueSchedule() {
    if (window['queueDrainTimer']) {
        clearTimeout(window['queueDrainTimer']);
        window['queueDrainTimer'] = null;
    }
}

function scheduleQueueDrain() {
    if (window['queueDrainTimer'] || window['down_stopped']) {
        return;
    }
    window['queueDrainTimer'] = setTimeout(function () {
        window['queueDrainTimer'] = null;
        drainQueue();
    }, 0);
}

function drainQueue() {
    if (window['down_stopped']) {
        return;
    }
    let started = 0;
    while (window['downCurrent'] < window['down_allow'] && arrayQueue.length() > 0) {
        let queue = arrayQueue.pop();
        if (!queue) {
            break;
        }
        if(queue.type === 'down'){
            started++;
            down(...queue.data);
        }else if(queue.type === 'finish'){
            if (window['downCurrent'] > 0 || arrayQueue.length() > 0) {
                arrayQueue.push(queue);
                break;
            }
            reset_album_info(queue.data);
        }
    }
    if (started > 0 || arrayQueue.length() > 0) {
        console.log('[queue:drain]', {
            started: started,
            pending: arrayQueue.length(),
            downCurrent: window['downCurrent'],
            down_allow: window['down_allow']
        });
    }
    if (arrayQueue.length() > 0 && window['downCurrent'] < window['down_allow']) {
        scheduleQueueDrain();
    }
}

function register_download_session(uid, album_id, type, folder) {
    if (!window['downloadSessions']) {
        window['downloadSessions'] = {};
    }
    window['download_finished' + album_id] = false;
    window['downloadSessions'][album_id] = {
        uid: uid,
        album_id: album_id,
        type: type,
        folder: folder
    };
}

function resume_download_sessions() {
    let sessions = window['downloadSessions'] || {};
    let resumed = 0;
    for (let album_id in sessions) {
        if (window['download_finished' + album_id]) {
            continue;
        }
        let session = sessions[album_id];
        if (!session) {
            continue;
        }
        resumed++;
        if (!queue_has_task(session.album_id, 'finish')) {
            down_url(session.uid, session.album_id, session.type, session.folder);
        }
    }
    console.log('[download:resume]', {
        resumed: resumed,
        pending: arrayQueue.length(),
        downCurrent: window['downCurrent']
    });
    return resumed;
}

function queue_has_task(album_id, type) {
    let list = arrayQueue.list();
    for (let i in list) {
        if (list[i] && list[i].type === type && list[i].data == album_id) {
            return true;
        }
    }
    return false;
}
