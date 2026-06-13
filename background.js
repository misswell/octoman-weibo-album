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
        let target_name = clean_user_name(name) || uid;
        if (window['albumDetail' + album_id]) {
            window['albumDetail' + album_id].name = target_name;
        }
        let folder = target_name + '_' + caption;
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

    } else if(request.type === 'down_pause'){
        window['down_pause'] = !window['down_pause'];
        console.log(window['down_pause']);
        if (!window['down_pause']) {
            scheduleQueueDrain();
        }
        sendResponse(window['down_pause']);
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
        arrayQueue.reset();
        clearQueueSchedule();
        sendResponse(true);
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

function parse_target_name(res, expected_uid) {
    let data = res && res.data ? res.data : res;
    let candidates = [
        data && data.user,
        data && data.userInfo,
        data && data.profile,
        data
    ];
    for (let i in candidates) {
        let user = candidates[i];
        if (!user) {
            continue;
        }
        if (expected_uid && !user_matches_uid(user, expected_uid)) {
            continue;
        }
        let name = clean_user_name(user.screen_name || user.name || user.nick_name || user.nickname);
        if (name) {
            return name;
        }
    }
    return '';
}

function clean_user_name(name) {
    return (name || '').toString().replace(/^@\s*/, '').trim();
}

function user_matches_uid(user, expected_uid) {
    expected_uid = expected_uid ? expected_uid.toString() : '';
    let actual_uid = user && (user.idstr || user.id || user.uid || user.user_id || user.profile_uid);
    if (!expected_uid || !actual_uid) {
        return true;
    }
    return actual_uid.toString() === expected_uid;
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
                    album_get_image_wall(info, '旧相册接口未返回相册')
                }
            }
        } else {
            album_get_image_wall(info, '相册列表请求错误，code ' + res.code)
        }
        console.log(res)

    }, function () {
        album_get_image_wall(info, '相册列表请求没有响应')
    })
}

let base_folder = 'WeiboAlbum';

function down_url(uid, album_id, type, folder) {
    if (type === 'image_wall') {
        down_image_wall(uid, album_id, folder);
        return;
    }
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
        if (res.code === 0) {
            let photo_list = res.data['photo_list'];
            let total = res.data['total'];
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
                    down_url(uid, album_id, type, folder);
                }, DELAY_PAGE * 1000));
            } else {
                if (!redo(uid, album_id, type, folder, 1)) {
                    console.log('all photo_list_temp', photo_list_temp);
                    window['page' + album_id] = 1;
                    window['photo_list_temp' + album_id] = [];
                }
            }
        } else if (type == 3) {
            down_image_wall(uid, album_id, folder);
        } else {
            redo(uid, album_id, type, folder, 2)
        }
    }, function () {
        if (type == 3) {
            down_image_wall(uid, album_id, folder);
        } else {
            redo(uid, album_id, type, folder, 3);
        }
    })
}

function album_get_image_wall(info, reason) {
    let uid = info.uid;
    let name = info.name;
    let album_id = 'image_wall_' + uid;
    fetch_image_wall_page(uid, 0, function (res) {
        if (res.error) {
            events.album_fail(reason + '，图片墙接口也不可用：' + res.error);
            return;
        }
        if (res.user_name) {
            name = res.user_name;
        }
        let photo_list = res.photo_list || [];
        let first = photo_list[0] || {};
        let album = {
            album_id: album_id,
            uid: uid.toString(),
            caption: '全部图片',
            cover_pic: first.link || 'https://img.t.sinajs.cn/t4/appstyle/photo/images/common/status_0.png',
            type: 'image_wall',
            count: {photos: res.total || photo_list.length || 0}
        };
        window['albumDetail' + album_id] = {
            album_id: album.album_id,
            caption: album.caption,
            cover_pic: album.cover_pic,
            type: album.type,
            count: album.count.photos,
            name: name
        };
        events.album_list({list: [album], name: name, uid: uid.toString()});
    });
}

function down_image_wall(uid, album_id, folder) {
    let sinceid = window['sinceid' + album_id];
    if (sinceid === undefined || sinceid === null) {
        sinceid = 0;
    }
    down_modern_album_page(uid, album_id, folder, sinceid, fetch_image_wall_page, function () {
        if (!redo_image_wall(uid, album_id, folder)) {
            enqueue_download_task({'type':'finish','data':album_id});
        }
    });
}

function down_modern_album_page(uid, album_id, folder, sinceid, fetch_page, fail_callback) {
    if (!window['photo_seen' + album_id]) {
        window['photo_seen' + album_id] = {};
    }
    fetch_page(uid, sinceid, function (res) {
        if (res.error) {
            typeof fail_callback === 'function' && fail_callback(res);
            return;
        }
        let photo_list = res.photo_list || [];
        let info_list = [];
        let queue;
        for (let i in photo_list) {
            if (!photo_list[i].link || window['photo_seen' + album_id][photo_list[i].link]) {
                continue;
            }
            window['photo_seen' + album_id][photo_list[i].link] = true;
            info_list.push(photo_list[i]);
        }
        if (info_list.length > 0) {
            for (let i in info_list) {
                setTimeout(function () {
                    queue = [info_list[i]['link'], base_folder + '/' + folder + '/' + info_list[i]['name'], album_id];
                    enqueue_download_task({'type':'down','data':queue});
                }, 10 * i);
            }
            window['timer'+album_id] += info_list.length;
            window['redo' + album_id] = 0;
        }
        if (res.sinceid && res.sinceid !== sinceid && photo_list.length > 0) {
            window['sinceid' + album_id] = res.sinceid;
            timeoutList(setTimeout(function () {
                down_modern_album_page(uid, album_id, folder, res.sinceid, fetch_page, fail_callback);
            }, DELAY_PAGE * 1000));
        } else {
            enqueue_download_task({'type':'finish','data':album_id});
        }
    });
}

function redo_image_wall(uid, album_id, folder) {
    if (!window['redo' + album_id]) {
        window['redo' + album_id] = 0
    }
    if (window['redo' + album_id] < 3) {
        window['redo' + album_id] = window['redo' + album_id] + 1;
        timeoutList(setTimeout(function () {
            down_image_wall(uid, album_id, folder);
        }, DELAY_PAGE * 1000));
        return true;
    }
    return false;
}

function fetch_image_wall_page(uid, sinceid, callback) {
    let url = 'https://weibo.com/ajax/profile/getImageWall';
    let data = {
        uid: uid.toString(),
        sinceid: sinceid || 0,
        has_album: true,
        __rnd: (new Date()).getTime()
    };
    fetch_modern_photo_page(url, data, callback, weibo_profile_referrer(uid));
}

function fetch_modern_photo_page(url, request_data, callback, referrer) {
    fetch_json(url, request_data, function (res) {
            if (res && (res.ok === 0 || (res.code && res.code !== 0))) {
                callback({error: res.msg || res.message || ('code ' + res.code)});
                return;
            }
            let data = res && res.data ? res.data : res;
            let raw_list = [];
            if (data) {
                raw_list = data.list || data.photo_list || data.pics || data.cards || data.statuses || [];
                if (!raw_list.length && typeof raw_list === 'object') {
                    raw_list = Object.values(raw_list);
                }
            }
            let photo_list = parse_image_wall_list(raw_list);
            let expected_uid = expected_uid_from_request(request_data);
            let user_name = extract_user_name(raw_list, expected_uid) || extract_user_name(data, expected_uid);
            let next_sinceid = data ? (data.since_id || data.sinceid || data.next_since_id || data.next_sinceid) : 0;
            let total = data ? (data.total || data.total_number || data.count) : 0;
            callback({photo_list: photo_list, sinceid: next_sinceid, total: total, user_name: user_name});
        }, function (status) {
            callback({error: status || 'request error'});
        }, referrer);
}

function extract_user_name(value, expected_uid) {
    if (!value) {
        return '';
    }
    if (Array.isArray(value)) {
        for (let i in value) {
            let name = extract_user_name(value[i], expected_uid);
            if (name) {
                return name;
            }
        }
        return '';
    }
    if (typeof value !== 'object') {
        return '';
    }
    let priority_keys = ['mblog', 'status', 'blog'];
    for (let i in priority_keys) {
        let item = value[priority_keys[i]];
        let user_name = parse_target_name(item && item.user ? item.user : item, expected_uid);
        if (user_name) {
            return user_name;
        }
    }
    let direct = parse_target_name(value, expected_uid);
    if (direct) {
        return direct;
    }
    let keys = ['mblog', 'status', 'blog', 'card', 'user', 'userInfo', 'retweeted_status'];
    for (let i in keys) {
        let name = extract_user_name(value[keys[i]], expected_uid);
        if (name) {
            return name;
        }
    }
    if (value.cards || value.list || value.statuses) {
        return extract_user_name(value.cards || value.list || value.statuses, expected_uid);
    }
    return '';
}

function expected_uid_from_request(request_data) {
    if (request_data.uid) {
        return request_data.uid.toString();
    }
    return '';
}

function weibo_profile_referrer(uid) {
    return 'https://weibo.com/u/' + uid + '?tabtype=album';
}

function fetch_json(url, data, success, fail, referrer) {
    let request_url = url + '?' + new URLSearchParams(data).toString();
    let timer = null;
    let controller = new AbortController();

    get_weibo_xsrf_token(function (xsrf_token) {
        let headers = {
            'Accept': 'application/json, text/plain, */*',
            'X-Requested-With': 'XMLHttpRequest',
            'Client-Version': '3.0.0'
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

function parse_image_wall_list(list) {
    let photo_list = [];
    if (!list || !list.length) {
        return photo_list;
    }
    for (let i in list) {
        photo_list = photo_list.concat(parse_image_wall_item(list[i]));
    }
    return photo_list;
}

function parse_image_wall_item(item) {
    let photo_list = [];
    if (!item) {
        return photo_list;
    }
    if (item.pics && item.pics.length) {
        for (let i in item.pics) {
            photo_list = photo_list.concat(parse_image_wall_item(item.pics[i]));
        }
    }
    if (item.pic_infos) {
        for (let pid in item.pic_infos) {
            let pic = item.pic_infos[pid];
            let link = pick_pic_url(pic);
            if (link) {
                photo_list.push({link: link, name: filename_from_pic(pid, link)});
            }
        }
    }
    if (item.pic_info) {
        let link = pick_pic_url(item.pic_info);
        if (link) {
            let pid = item.pic_info.pid || item.pic_info.pic_id || item.pid || item.id || '';
            photo_list.push({link: link, name: filename_from_pic(pid, link)});
        }
    }
    let link = pick_pic_url(item);
    if (link) {
        let pid = item.pid || item.pic_id || item.object_id || item.id || '';
        photo_list.push({link: link, name: filename_from_pic(pid, link)});
    }
    return photo_list;
}

function pick_pic_url(pic) {
    if (!pic) {
        return '';
    }
    let keys = ['largest', 'original', 'mw2000', 'large', 'bmiddle', 'middleplus', 'thumbnail'];
    for (let i in keys) {
        if (pic[keys[i]] && pic[keys[i]].url && is_weibo_image_url(pic[keys[i]].url)) {
            return normalize_weibo_image_url(pic[keys[i]].url);
        }
    }
    let urls = [pic.pic_large, pic.large, pic.pic, pic.url];
    for (let i in urls) {
        if (urls[i] && is_weibo_image_url(urls[i])) {
            return normalize_weibo_image_url(urls[i]);
        }
    }
    return '';
}

function is_weibo_image_url(url) {
    if (!url || typeof url !== 'string') {
        return false;
    }
    return /^https?:\/\/[^\/]*(sinaimg|sinajs)\.cn\//i.test(url);
}

function normalize_weibo_image_url(url) {
    if (!is_weibo_image_url(url)) {
        return '';
    }
    return url.replace(/\/(thumb\d+|thumbnail|orj\d+|mw\d+|bmiddle|small|square)\//, '/large/');
}

function filename_from_pic(pid, link) {
    let name = pid || '';
    if (!name && link) {
        name = link.split('?')[0].split('/').pop();
    }
    name = name || ((new Date()).getTime()).toString();
    if (!ext(name)) {
        name = name + (ext(link.split('?')[0]) || '.jpg');
    }
    return reg_filename(name);
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
            down_url(uid, album_id, type, folder);
        }, DELAY_PAGE * 1000));
        return true;
    } else {
        enqueue_download_task({'type':'finish','data':album_id});
        return false;
    }
}

function reset_album_info(album_id){
    events.album_complete({
        album_id: album_id,
        uid: window['uid' + album_id],
        suc: window['download_suc' + album_id]?window['download_suc' + album_id]:0,
        fail: window['download_fail' + album_id]?window['download_fail' + album_id]:0,
        info:'下载完成',
        album_detail: window['albumDetail' + album_id]
    });
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

function avg(array) {
    var len = array.length;
    var sum = 0;
    for (var i = 0; i < len; i++) {
        sum += array[i];
    }
    var res = sum / len;
    console.log('avg',res);
    res =  Math.floor((sum / len)* 1000) / 1000;
    console.log('avg floor',res);
    return res;
}

function down(url, name, album_id, callback) {
    // console.log(url, name);
    name = normalize_download_filename(name);
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
                album_detail: window['albumDetail' + album_id]
            });
        }
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    })
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
        queue_data_url_filename(name);
        download_direct({url: data_url, filename: name, conflictAction: 'overwrite'}, url, name, album_id, startStamp, callback);
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
                album_detail: window['albumDetail' + album_id]
            });
        }
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

let pendingDataUrlFilenames = [];

function queue_data_url_filename(filename) {
    pendingDataUrlFilenames.push({
        filename: filename,
        time: (new Date()).getTime()
    });
    if (pendingDataUrlFilenames.length > 200) {
        pendingDataUrlFilenames = pendingDataUrlFilenames.slice(-200);
    }
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

chrome.downloads.onDeterminingFilename.addListener(function (item, suggest) {
    if (item && item.url && item.url.indexOf('data:') === 0) {
        let pending = pendingDataUrlFilenames.shift();
        if (pending && pending.filename) {
            console.log('[download:filename:suggest]', {
                downloadId: item.id,
                originalFilename: item.filename,
                suggestedFilename: pending.filename
            });
            suggest({filename: pending.filename, conflictAction: 'overwrite'});
            return;
        }
        console.warn('[download:filename:missing]', {
            downloadId: item.id,
            originalFilename: item.filename
        });
    }
});

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
        console.log('[download:onChanged:filename]', {
            downloadId: delta.id,
            filename: delta.filename.current || delta.filename.previous
        });
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
down_pause = false;
window['queueDrainTimer'] = null;
config_get('down_allow', function (value) {
    down_allow = value !== null ? value : 1;
    config_set({'down_allow':down_allow});
});

function enqueue_download_task(task) {
    arrayQueue.push(task);
    scheduleQueueDrain();
}

function clearQueueSchedule() {
    if (window['queueDrainTimer']) {
        clearTimeout(window['queueDrainTimer']);
        window['queueDrainTimer'] = null;
    }
}

function scheduleQueueDrain() {
    if (window['queueDrainTimer'] || window['down_pause']) {
        return;
    }
    window['queueDrainTimer'] = setTimeout(function () {
        window['queueDrainTimer'] = null;
        drainQueue();
    }, 0);
}

function drainQueue() {
    if (window['down_pause']) {
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
