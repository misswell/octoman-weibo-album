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
        events.pop_info({activity: '正在识别当前微博页面和当前用户'});
        getCurrentTab(function (res) {
            console.log('current_page', res);
            events.pop_info({activity: res ? '已识别当前用户，正在获取相册列表' : '未识别到可下载的微博用户'});
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
        let package_download = data.package_download == 1 || data.package_download === true;
        let package_size = normalize_package_size(data.package_size);
        window['ratio'+album_id] = ratio;
        window['open'+album_id] = open;
        window['package_download' + album_id] = package_download;
        window['package_size' + album_id] = package_size;
        window['package_buffer' + album_id] = [];
        window['package_index' + album_id] = 1;
        window['package_done' + album_id] = 0;
        window['package_total' + album_id] = 0;
        window['package_total_extra' + album_id] = 0;
        window['package_processed' + album_id] = 0;
        window['package_current_index' + album_id] = 0;
        window['package_current_done' + album_id] = 0;
        window['package_current_total' + album_id] = 0;
        window['package_builders_' + album_id] = {};
        window['package_open_builder_' + album_id] = null;
        window['package_prefetched_count_' + album_id] = 0;
        window['package_page_waiting_' + album_id] = false;
        set_album_activity(album_id, '正在初始化下载参数：比例 ' + ratio + '，并发 ' + down_allow + (package_download ? ('，打包每包 ' + package_size + ' 张') : '，逐张下载'), 'running');
        window['download_suc' + album_id] = 0;
        window['download_fail' + album_id] = 0;
        window['timer'+album_id] = 0;
        window['uid'+album_id] = uid;
        window.page = 1;
        window.photo_list_temp = [];
        window['down_allow'] = down_allow;
        window['down_stopped'] = false;
        window['album_stopped_' + album_id] = false;
        window['album_removed_' + album_id] = false;
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
        update_package_total(album_id);
        let folder = package_download ? target_name : target_name + '_' + caption;
        register_download_session(uid, album_id, type, folder);
        console.log('down_album target folder', {uid: uid, target_name: target_name, caption: caption, folder: folder, package_download: package_download, package_size: package_size});
        emit_album_progress(album_id);
        down_url(uid, album_id, type, folder);
        sendResponse(true)
    } else if (request.type === 'album_get') {
        let info = request.data;
        console.log('album_get data', info);
        events.pop_info({activity: '正在获取用户 ' + (clean_user_name(info.name) || info.uid) + ' 的相册列表第 1 页'});
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
        abort_all_active_tasks();
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
        abort_album_active_tasks(album_id);
        clear_album_timers(album_id);
        set_album_activity(album_id, '已暂停，当前请求已停止，队列会保留到继续时恢复', 'stopped');
        emit_album_progress(album_id);
        sendResponse({album_id: album_id, stopped: true, suc: window['download_suc' + album_id] || 0, total: get_album_total(album_id), package_progress: get_package_progress(album_id), activity: get_album_activity(album_id)});
    } else if(request.type === 'album_resume'){
        let album_id = request.album_id;
        window['album_stopped_' + album_id] = false;
        window['album_removed_' + album_id] = false;
        let session = (window['downloadSessions'] || {})[album_id];
        if (session && !window['download_finished' + album_id]) {
            set_album_activity(album_id, '正在继续下载队列', 'running');
            emit_album_progress(album_id);
            scheduleQueueDrain();
            if (!is_package_download(album_id) || !window['package_page_waiting_' + album_id] || !should_wait_for_package_download(album_id)) {
                down_url(session.uid, session.album_id, session.type, session.folder);
            }
        }
        sendResponse({album_id: album_id, suc: window['download_suc' + album_id] || 0, total: get_album_total(album_id), package_progress: get_package_progress(album_id), activity: get_album_activity(album_id)});
    } else if(request.type === 'album_remove'){
        let album_id = request.album_id;
        clear_album_queue_tasks(album_id);
        window['album_stopped_' + album_id] = true;
        window['album_removed_' + album_id] = true;
        window['download_finished' + album_id] = true;
        abort_album_active_tasks(album_id);
        clear_album_timers(album_id);
        cleanup_album_package_builders(album_id);
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
        delete window['package_buffer' + album_id];
        delete window['package_index' + album_id];
        delete window['package_download' + album_id];
        delete window['package_size' + album_id];
        delete window['package_done' + album_id];
        delete window['package_total' + album_id];
        delete window['package_total_extra' + album_id];
        delete window['package_processed' + album_id];
        delete window['package_current_index' + album_id];
        delete window['package_current_done' + album_id];
        delete window['package_current_total' + album_id];
        delete window['package_builders_' + album_id];
        delete window['package_open_builder_' + album_id];
        delete window['package_prefetched_count_' + album_id];
        delete window['package_page_waiting_' + album_id];
        delete window['albumActivity' + album_id];
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
                package_progress: get_package_progress(album_id),
                activity: get_album_activity(album_id),
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
    name = (name || '').toString().replace(/^@\s*/, '').trim();
    if (!name || /^(下载|微博|微相册|相册|主页|用户)$/i.test(name)) {
        return '';
    }
    return name;
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
    events.pop_info({
        activity: '正在请求相册列表第 ' + window['albumPage' + uid] + ' 页，已读取 ' + window['albumList' + uid].length + ' 个相册'
    });

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
                events.pop_info({
                    activity: '相册列表第 ' + data.page + ' 页返回 ' + list.length + ' 个相册，正在整理封面和数量'
                });
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
                    events.pop_info({
                        activity: '相册列表还有更多内容，准备获取第 ' + window['albumPage' + uid] + ' 页'
                    });
                    album_get(info)
                } else {
                    console.log("window['albumList'+uid]", window['albumList' + uid]);
                    events.pop_info({
                        activity: '相册列表读取完成，共 ' + window['albumList' + uid].length + ' 个相册'
                    });
                    events.album_list({list: window['albumList' + uid], name: name, uid: uid.toString()})
                }
            } else {
                console.log("window['albumList'+uid]", window['albumList' + uid]);
                if (window['albumList' + uid].length > 0) {
                    events.pop_info({
                        activity: '相册列表读取完成，共 ' + window['albumList' + uid].length + ' 个相册'
                    });
                    events.album_list({list: window['albumList' + uid], name: name, uid: uid.toString()})
                } else {
                    events.pop_info({activity: '相册列表为空，无法继续下载'});
                    events.album_fail('相册列表为空或不可访问，请确认当前页面用户 UID 是否正确')
                }
            }
        } else {
            events.pop_info({activity: '相册列表请求失败：code ' + res.code});
            events.album_fail('相册列表请求错误，code ' + res.code)
        }
        console.log(res)

    }, function () {
        events.pop_info({activity: '相册列表请求超时或没有响应'});
        events.album_fail('相册列表请求没有响应')
    }, photo_album_referrer(uid))
}

let base_folder = 'WeiboAlbum';

function down_url(uid, album_id, type, folder) {
    if (is_album_paused_or_removed(album_id) || window['down_stopped']) {
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
    set_album_activity(album_id, '正在获取相册图片列表第 ' + page + ' 页', 'running');
    emit_album_progress(album_id);
    fetch_json(url, data, function (res) {
        if (is_album_paused_or_removed(album_id) || window['down_stopped']) {
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
            set_album_activity(album_id, '第 ' + page + ' 页返回 ' + photo_list.length + ' 张图片，当前相册共 ' + total + ' 张', 'running');
            emit_album_progress(album_id);
            if (photo_list.length > 0) {
                if(window['ratio'+album_id] && window['timer'+album_id] > total*window['ratio'+album_id]){
                    set_album_activity(album_id, '已达到下载比例限制，正在提交剩余打包任务', 'running');
                    emit_album_progress(album_id);
                    flush_package_items(album_id, folder);
                    enqueue_download_task({'type':'finish','data':album_id});
                    return;
                }
                window['timer'+album_id] += photo_list.length;
                set_album_activity(album_id, '正在解析第 ' + page + ' 页图片地址，累计读取 ' + window['timer'+album_id] + ' 张', 'running');
                emit_album_progress(album_id);
                info_list = photo_list.map((item) => {
                    let link = item['pic_host'] + '/large/' + item['pic_name'];
                    let name_uni = ext(item['pic_name']) ? item['pic_name'] : item['pic_name'] + '.jpg';
                    return {link: link, name: name_uni}
                });
                if (is_package_download(album_id)) {
                    set_album_activity(album_id, '正在把第 ' + page + ' 页的 ' + info_list.length + ' 张图片加入打包队列', 'running');
                    enqueue_package_items(album_id, folder, info_list);
                    window['package_prefetched_count_' + album_id] = (window['package_prefetched_count_' + album_id] || 0) + info_list.length;
                } else {
                    set_album_activity(album_id, '正在把第 ' + page + ' 页的 ' + info_list.length + ' 张图片加入下载队列', 'running');
                    for (let i in info_list) {
                        setTimeout(function () {
                            queue = [info_list[i]['link'],base_folder + '/' + folder + '/' + info_list[i]['name'], album_id];

                            enqueue_download_task({'type':'down','data':queue});

                        }, 10 * i);
                    }
                }
                emit_album_progress(album_id);
                window['photo_list_temp' + album_id] = [...photo_list_temp, ...info_list];
                window['page' + album_id] = page + 1;
                window['redo' + album_id] = 0;
                set_album_activity(album_id, '第 ' + page + ' 页已入队，等待获取第 ' + window['page' + album_id] + ' 页', 'running');
                emit_album_progress(album_id);
                if (should_wait_for_package_download(album_id)) {
                    window['package_page_waiting_' + album_id] = true;
                    set_album_activity(album_id, '已获取当前包所需图片列表，等待当前 ZIP 保存后继续获取后续页面', 'running');
                    emit_album_progress(album_id);
                    return;
                }
                timeoutList(setTimeout(function () {
                    if (!is_album_paused_or_removed(album_id) && !window['down_stopped']) {
                        down_url(uid, album_id, type, folder);
                    }
                }, DELAY_PAGE * 1000), album_id);
            } else {
                set_album_activity(album_id, '第 ' + page + ' 页没有更多图片，正在确认是否结束', 'running');
                emit_album_progress(album_id);
                if (!redo(uid, album_id, type, folder, 1)) {
                    console.log('all photo_list_temp', photo_list_temp);
                    set_album_activity(album_id, '图片列表读取完成，正在提交最后一批打包任务', 'running');
                    emit_album_progress(album_id);
                    flush_package_items(album_id, folder);
                    window['page' + album_id] = 1;
                    window['photo_list_temp' + album_id] = [];
                }
            }
    } else {
        set_album_activity(album_id, '第 ' + page + ' 页请求返回异常 code ' + res.code + '，准备重试', 'running');
        emit_album_progress(album_id);
        if (!redo(uid, album_id, type, folder, 2)) {
            flush_package_items(album_id, folder);
        }
    }
    }, function () {
        if (is_album_paused_or_removed(album_id) || window['down_stopped']) {
            console.log('[download:page:fail:stopped]', {uid: uid, album_id: album_id, page: page});
            return;
        }
        set_album_activity(album_id, '第 ' + page + ' 页请求失败，准备重试', 'running');
        emit_album_progress(album_id);
        if (!redo(uid, album_id, type, folder, 3)) {
            flush_package_items(album_id, folder);
        }
    }, photo_detail_referrer(uid, album_id, type), album_id)
}

function fetch_json(url, data, success, fail, referrer, album_id) {
    let request_url = url + '?' + new URLSearchParams(data).toString();
    let timer = null;
    let controller = create_album_abort_controller(album_id);

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
            release_album_abort_controller(album_id, controller);
            typeof success === 'function' && success(json);
        }).catch(function (e) {
            clearTimeout(timer);
            release_album_abort_controller(album_id, controller);
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

let albumAbortControllers = {};

function is_album_removed(album_id) {
    let sessions = window['downloadSessions'] || {};
    return !!window['album_removed_' + album_id] || (!!window['download_finished' + album_id] && !sessions[album_id]);
}

function is_album_paused(album_id) {
    return !!window['album_stopped_' + album_id] || !!window['down_stopped'];
}

function is_album_paused_or_removed(album_id) {
    return is_album_paused(album_id) || is_album_removed(album_id);
}

function create_album_abort_controller(album_id) {
    let controller = new AbortController();
    if (album_id) {
        if (!albumAbortControllers[album_id]) {
            albumAbortControllers[album_id] = [];
        }
        albumAbortControllers[album_id].push(controller);
    }
    return controller;
}

function release_album_abort_controller(album_id, controller) {
    if (!album_id || !albumAbortControllers[album_id]) {
        return;
    }
    albumAbortControllers[album_id] = albumAbortControllers[album_id].filter(function (item) {
        return item !== controller;
    });
    if (albumAbortControllers[album_id].length === 0) {
        delete albumAbortControllers[album_id];
    }
}

function abort_album_active_tasks(album_id) {
    let controllers = albumAbortControllers[album_id] || [];
    for (let i in controllers) {
        try {
            controllers[i].abort();
        } catch (e) {}
    }
    delete albumAbortControllers[album_id];
}

function abort_all_active_tasks() {
    for (let album_id in albumAbortControllers) {
        abort_album_active_tasks(album_id);
    }
}

let timeoutQueue = new ArrayQueue();
function timeoutList(timeId, album_id){
    timeoutQueue.push({id: timeId, album_id: album_id || null})
}
function timeoutClear(){
    let item;
    do{
        item = timeoutQueue.pop();
        if(item){
            clearTimeout(item.id || item);
        }
    }while (item);
}
function clear_album_timers(album_id) {
    let kept = [];
    let item;
    do {
        item = timeoutQueue.pop();
        if (item) {
            let item_album_id = item.album_id || null;
            if (item_album_id == album_id) {
                clearTimeout(item.id || item);
            } else {
                kept.push(item);
            }
        }
    } while (item);
    for (let i in kept) {
        timeoutQueue.push(kept[i]);
    }
}

function redo(uid, album_id, type, folder, code) {
    if (!window['redo' + album_id]) {
        window['redo' + album_id] = 0
    }
    if (window['redo' + album_id] < code) {
        window['redo' + album_id] = window['redo' + album_id] + 1;
        set_album_activity(album_id, '第 ' + (window['page' + album_id] || 1) + ' 页暂未拿到数据，准备第 ' + window['redo' + album_id] + ' 次重试', 'running');
        emit_album_progress(album_id);
        timeoutList(setTimeout(function () {
            if (!is_album_paused_or_removed(album_id) && !window['down_stopped']) {
                down_url(uid, album_id, type, folder);
            }
        }, DELAY_PAGE * 1000), album_id);
        return true;
    } else {
        set_album_activity(album_id, '相册分页读取结束，正在收尾下载队列', 'running');
        emit_album_progress(album_id);
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
    update_package_total(album_id);
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

function get_album_target_total(album_id) {
    let total = get_album_total(album_id);
    let ratio = parseFloat(window['ratio' + album_id]);
    if (total > 0 && ratio > 0 && ratio < 1) {
        return Math.ceil(total * ratio);
    }
    return total;
}

function update_package_total(album_id) {
    if (!is_package_download(album_id)) {
        return;
    }
    let target_total = get_album_target_total(album_id);
    let package_size = normalize_package_size(window['package_size' + album_id]);
    let extra = parseInt(window['package_total_extra' + album_id], 10) || 0;
    window['package_total' + album_id] = (target_total > 0 ? Math.ceil(target_total / package_size) : 0) + extra;
}

function get_package_progress(album_id) {
    update_package_total(album_id);
    let current_builder = get_current_package_builder(album_id);
    if (current_builder && current_builder.scheduled > 0) {
        window['package_current_index' + album_id] = current_builder.index;
        window['package_current_done' + album_id] = current_builder.processed;
        window['package_current_total' + album_id] = expected_package_item_count(album_id, current_builder);
    }
    let handled = (window['download_suc' + album_id] || 0) + (window['download_fail' + album_id] || 0);
    let processed = Math.max(window['package_processed' + album_id] || 0, handled);
    return {
        enabled: is_package_download(album_id),
        done: window['package_done' + album_id] || 0,
        total: window['package_total' + album_id] || 0,
        size: normalize_package_size(window['package_size' + album_id]),
        processed: processed,
        imageTotal: get_album_target_total(album_id),
        currentIndex: window['package_current_index' + album_id] || 0,
        currentDone: window['package_current_done' + album_id] || 0,
        currentTotal: window['package_current_total' + album_id] || 0
    };
}

function get_album_activity(album_id) {
    return window['albumActivity' + album_id] || {
        message: '等待后台任务',
        phase: 'idle',
        updated: 0
    };
}

function set_album_activity(album_id, message, phase) {
    if (!album_id) {
        return;
    }
    window['albumActivity' + album_id] = {
        message: message || '后台处理中',
        phase: phase || 'running',
        updated: (new Date()).getTime()
    };
}

function emit_album_progress(album_id, info, finished) {
    events.album_complete({
        album_id: album_id,
        uid: window['uid' + album_id],
        suc: window['download_suc' + album_id] ? window['download_suc' + album_id] : 0,
        fail: window['download_fail' + album_id] ? window['download_fail' + album_id] : 0,
        total: get_album_total(album_id),
        info: info,
        finished: !!finished,
        package_progress: get_package_progress(album_id),
        activity: get_album_activity(album_id),
        album_detail: window['albumDetail' + album_id]
    });
}

function reset_album_info(album_id){
    window['download_finished' + album_id] = true;
    if (window['downloadSessions']) {
        delete window['downloadSessions'][album_id];
    }
    let fail = window['download_fail' + album_id] ? window['download_fail' + album_id] : 0;
    let suc = window['download_suc' + album_id] ? window['download_suc' + album_id] : 0;
    let target = get_album_target_total(album_id) || get_album_total(album_id);
    let has_error = fail > 0 || (target > 0 && suc + fail < target);
    set_album_activity(album_id, has_error ? ('下载结束：成功 ' + suc + ' 张，失败 ' + fail + ' 张') : ('下载完成：成功 ' + suc + ' 张'), has_error ? 'error' : 'complete');
    emit_album_progress(album_id, has_error ? '下载结束' : '下载完成', true);
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
        window['package_buffer' + album_id] = [];
        window['package_index' + album_id] = 1;
        window['package_done' + album_id] = 0;
        window['package_total' + album_id] = 0;
        window['package_total_extra' + album_id] = 0;
        window['package_processed' + album_id] = 0;
        window['package_current_index' + album_id] = 0;
        window['package_current_done' + album_id] = 0;
        window['package_current_total' + album_id] = 0;
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

function normalize_package_size(value) {
    let size = parseInt(value, 10);
    if (!size || size < 1) {
        return 500;
    }
    return Math.min(size, 500);
}

function is_package_download(album_id) {
    return window['package_download' + album_id] === true || window['package_download' + album_id] == 1;
}

function enqueue_package_items(album_id, folder, info_list) {
    if (!is_package_download(album_id)) {
        return;
    }
    for (let i in info_list) {
        let item = info_list[i];
        enqueue_download_task({
            type: 'zipItem',
            data: {
                album_id: album_id,
                folder: folder,
                item: {
                    url: item.link,
                    name: item.name
                }
            }
        });
    }
}

function flush_package_items(album_id, folder, limit) {
    if (!is_package_download(album_id)) {
        return;
    }
    let builders = get_package_builders(album_id);
    for (let index in builders) {
        let builder = builders[index];
        if (builder && builder.scheduled > 0) {
            builder.closed = true;
            try_finalize_package_builder(album_id, builder);
        }
    }
}

function get_package_builders(album_id) {
    let key = 'package_builders_' + album_id;
    if (!window[key]) {
        window[key] = {};
    }
    return window[key];
}

function create_package_builder(album_id, folder) {
    let index_key = 'package_index' + album_id;
    if (!window[index_key]) {
        window[index_key] = 1;
    }
    let index = window[index_key]++;
    let builder = {
        album_id: album_id,
        folder: folder,
        index: index,
        scheduled: 0,
        processed: 0,
        success: 0,
        failed: 0,
        failedItems: [],
        files: [],
        used_names: {},
        closed: false,
        finalized: false,
        currentSize: 0
    };
    get_package_builders(album_id)[index] = builder;
    window['package_open_builder_' + album_id] = index;
    return builder;
}

function get_current_package_builder(album_id) {
    let open_index = window['package_open_builder_' + album_id];
    let builders = get_package_builders(album_id);
    return open_index && builders[open_index] ? builders[open_index] : null;
}

function reserve_package_builder_slot(album_id, folder) {
    let size = normalize_package_size(window['package_size' + album_id]);
    let builder = get_current_package_builder(album_id);
    if (!builder || builder.closed || builder.scheduled >= size) {
        if (builder && !builder.closed) {
            builder.closed = true;
            try_finalize_package_builder(album_id, builder);
        }
        builder = create_package_builder(album_id, folder);
    }
    builder.scheduled++;
    if (builder.scheduled >= size) {
        builder.closed = true;
        window['package_open_builder_' + album_id] = null;
    }
    window['package_current_index' + album_id] = builder.index;
    window['package_current_total' + album_id] = expected_package_item_count(album_id, builder);
    return builder;
}

function expected_package_item_count(album_id, builder) {
    let size = normalize_package_size(window['package_size' + album_id]);
    if (builder && builder.closed && builder.scheduled > 0) {
        return builder.scheduled;
    }
    let image_total = get_album_target_total(album_id);
    if (image_total > 0 && builder && builder.index) {
        return Math.max(0, Math.min(size, image_total - ((builder.index - 1) * size)));
    }
    return builder && builder.scheduled ? builder.scheduled : size;
}

function should_wait_for_package_download(album_id) {
    if (!is_package_download(album_id)) {
        return false;
    }
    let size = normalize_package_size(window['package_size' + album_id]);
    return (window['package_prefetched_count_' + album_id] || 0) >= size;
}

function maybe_resume_package_page_fetch(album_id) {
    if (!is_package_download(album_id) || !window['package_page_waiting_' + album_id]) {
        return;
    }
    if (is_album_paused_or_removed(album_id) || has_closed_package(album_id) || has_active_package_builder(album_id)) {
        return;
    }
    let session = (window['downloadSessions'] || {})[album_id];
    if (!session || window['download_finished' + album_id]) {
        return;
    }
    window['package_page_waiting_' + album_id] = false;
    set_album_activity(album_id, '当前 ZIP 已处理完成，继续获取后续图片列表', 'running');
    emit_album_progress(album_id);
    timeoutList(setTimeout(function () {
        if (!is_album_paused_or_removed(album_id) && !window['down_stopped']) {
            down_url(session.uid, session.album_id, session.type, session.folder);
        }
    }, 300), album_id);
}

function process_package_item(task, callback) {
    let album_id = task.album_id;
    if (!task.index && has_closed_package(album_id)) {
        arrayQueue.push({type: 'zipItem', data: task});
        typeof callback === 'function' && callback();
        return;
    }
    let builders = get_package_builders(album_id);
    let builder = task.index ? builders[task.index] : reserve_package_builder_slot(album_id, task.folder);
    task.index = builder ? builder.index : task.index;
    if (!builder || is_album_removed(album_id)) {
        typeof callback === 'function' && callback();
        return;
    }
    if (is_album_paused(album_id)) {
        arrayQueue.unshift({type: 'zipItem', data: task});
        typeof callback === 'function' && callback();
        return;
    }
    if (has_earlier_unfinished_package(album_id, task.index)) {
        arrayQueue.push({type: 'zipItem', data: task});
        typeof callback === 'function' && callback();
        return;
    }
    let startStamp = (new Date()).getTime();
    window['downCurrent'] = window['downCurrent'] + 1;
    window['packageActiveFetches'] = (window['packageActiveFetches'] || 0) + 1;
    window['package_current_index' + album_id] = builder.index;
    window['package_current_done' + album_id] = builder.processed;
    window['package_current_total' + album_id] = expected_package_item_count(album_id, builder);
    set_album_activity(album_id, '正在抓取第 ' + builder.index + ' 包图片 ' + builder.processed + ' / ' + expected_package_item_count(album_id, builder), 'running');
    emit_package_progress(album_id);
    fetch_weibo_image_blob_retry(task.item.url, album_id, task.item.name, 2).then(function (blob) {
        if (is_album_paused(album_id)) {
            arrayQueue.unshift({type: 'zipItem', data: task});
            return null;
        }
        if (is_album_removed(album_id)) {
            return null;
        }
        return blob.arrayBuffer();
    }).then(function (buffer) {
        if (!buffer || is_album_paused_or_removed(album_id)) {
            return;
        }
        let bytes = new Uint8Array(buffer);
        let blob = new Blob([bytes], {type: 'application/octet-stream'});
        let file = {
            name: zip_entry_name(task.item.name, builder.processed + 1, builder.used_names),
            key: create_download_blob_key('zip_item'),
            size: bytes.length,
            crc: crc32(bytes)
        };
        builder.currentSize += zip_file_estimated_size(file);
        return idb_put_blob(file.key, blob).then(function () {
            builder.files.push(file);
            builder.success++;
            builder.processed++;
            record_package_item_processed(album_id, builder);
        console.log('[download:zip:item:done]', {
                album_id: album_id,
                packageIndex: builder.index,
                filename: task.item.name,
                elapsed: (new Date()).getTime() - startStamp
            });
        });
    }).catch(function (e) {
        if (is_album_paused(album_id) && !is_album_removed(album_id)) {
            arrayQueue.unshift({type: 'zipItem', data: task});
            return;
        }
        if (is_album_removed(album_id)) {
            return;
        }
        builder.failed++;
        builder.processed++;
        builder.failedItems.push({
            url: task.item.url,
            name: task.item.name,
            error: e && e.message ? e.message : e,
            packageIndex: builder.index,
            time: (new Date()).toISOString()
        });
        console.warn('[download:zip:item:error]', {
            album_id: album_id,
            url: task.item.url,
            filename: task.item.name,
            error: e && e.message ? e.message : e
        });
        record_package_item_processed(album_id, builder);
    }).then(function () {
        window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
        window['packageActiveFetches'] = Math.max(0, (window['packageActiveFetches'] || 0) - 1);
        try_finalize_package_builder(album_id, builder);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

function try_finalize_package_builder(album_id, builder) {
    if (!builder || builder.finalized || is_album_paused_or_removed(album_id)) {
        return;
    }
    if (!builder.closed || builder.processed < builder.scheduled) {
        return;
    }
    builder.finalized = true;
    enqueue_download_task({
        type: 'zipSave',
        data: {
            album_id: album_id,
            folder: builder.folder,
            index: builder.index,
            files: builder.files,
            failed: builder.failed,
            failedItems: builder.failedItems,
            scheduled: builder.scheduled
        }
    }, true);
}

function has_earlier_unfinished_package(album_id, package_index) {
    let builders = get_package_builders(album_id);
    package_index = parseInt(package_index, 10) || 0;
    for (let index in builders) {
        index = parseInt(index, 10) || 0;
        if (index > 0 && index < package_index && builders[index]) {
            return true;
        }
    }
    return false;
}

function has_closed_package(album_id) {
    let builders = get_package_builders(album_id);
    for (let index in builders) {
        let builder = builders[index];
        if (builder && builder.closed) {
            return true;
        }
    }
    return false;
}

function has_active_package_builder(album_id) {
    let builders = get_package_builders(album_id);
    for (let index in builders) {
        let builder = builders[index];
        if (builder && builder.scheduled > 0) {
            return true;
        }
    }
    return false;
}

function cleanup_album_package_builders(album_id) {
    let builders = get_package_builders(album_id);
    for (let index in builders) {
        if (builders[index]) {
            cleanup_package_file_blobs(builders[index].files);
            builders[index].files = [];
        }
    }
    window['package_builders_' + album_id] = {};
    window['package_open_builder_' + album_id] = null;
}

function down(url, name, album_id, callback) {
    if (is_album_removed(album_id)) {
        typeof callback === 'function' && callback();
        return;
    }
    if (is_album_paused(album_id)) {
        arrayQueue.unshift({type: 'down', data: [url, name, album_id]});
        typeof callback === 'function' && callback();
        return;
    }
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

function fetch_weibo_image_blob(url, album_id, filename) {
    let controller = create_album_abort_controller(album_id);
    return fetch(url, {
        method: 'GET',
        credentials: 'include',
        signal: controller.signal,
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
            filename: filename,
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
        release_album_abort_controller(album_id, controller);
        return blob;
    }).catch(function (e) {
        release_album_abort_controller(album_id, controller);
        throw e;
    });
}

function fetch_weibo_image_blob_retry(url, album_id, filename, attempts) {
    attempts = attempts || 2;
    return fetch_weibo_image_blob(url, album_id, filename).catch(function (e) {
        if (is_album_paused_or_removed(album_id) || attempts <= 1 || (e && e.name === 'AbortError')) {
            throw e;
        }
        console.warn('[download:fetch:retry]', {
            album_id: album_id,
            url: url,
            filename: filename,
            attemptsLeft: attempts - 1,
            error: e && e.message ? e.message : e
        });
        return new Promise(function (resolve) {
            setTimeout(resolve, 800);
        }).then(function () {
            return fetch_weibo_image_blob_retry(url, album_id, filename, attempts - 1);
        });
    });
}

function download_weibo_image(url, name, album_id, startStamp, callback) {
    set_album_activity(album_id, '正在下载图片：' + (name || basename_from_url(url)), 'running');
    emit_album_progress(album_id);
    fetch_weibo_image_blob(url, album_id, name).then(function (blob) {
        if (is_album_paused(album_id) && !is_album_removed(album_id)) {
            window['downCurrent'] =  window['downCurrent'] - 1;
            arrayQueue.unshift({type: 'down', data: [url, name, album_id]});
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        if (is_album_removed(album_id)) {
            window['downCurrent'] =  window['downCurrent'] - 1;
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        download_blob_direct(blob, url, name, album_id, startStamp, callback);
    }).catch(function (e) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        if (is_album_paused(album_id) && !is_album_removed(album_id)) {
            arrayQueue.unshift({type: 'down', data: [url, name, album_id]});
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        if (is_album_removed(album_id)) {
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        set_album_activity(album_id, '图片下载失败：' + (e && e.message ? e.message : e), 'error');
        console.warn('[download:fetch:error]', {
            album_id: album_id,
            url: url,
            filename: name,
            error: e && e.message ? e.message : e
        });
        record_download_progress(album_id, 0, 1);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

// Do not register chrome.downloads.onDeterminingFilename here.
// Even a narrow listener participates in Chrome's global filename arbitration and can conflict with sibling extensions.
// Do not use data: URLs for large downloads either; Chrome may copy huge base64 strings into the main process and crash.

let offscreenDocumentCreating = null;
let offscreenUnavailableUntil = 0;
let downloadBlobStoreName = 'blobs';
let downloadDbName = 'octo_weibo_album_downloads';

function open_download_db() {
    return new Promise(function (resolve, reject) {
        let request = indexedDB.open(downloadDbName, 1);
        request.onupgradeneeded = function () {
            let db = request.result;
            if (!db.objectStoreNames.contains(downloadBlobStoreName)) {
                db.createObjectStore(downloadBlobStoreName);
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

function idb_put_blob(key, blob) {
    return open_download_db().then(function (db) {
        return new Promise(function (resolve, reject) {
            let tx = db.transaction(downloadBlobStoreName, 'readwrite');
            let store = tx.objectStore(downloadBlobStoreName);
            let request = store.put({blob: blob, time: (new Date()).getTime()}, key);
            request.onsuccess = function () {
                resolve(true);
            };
            request.onerror = function () {
                reject(request.error || new Error('IndexedDB write failed'));
            };
            tx.oncomplete = function () {
                db.close();
            };
        });
    });
}

function idb_get_blob(key) {
    return open_download_db().then(function (db) {
        return new Promise(function (resolve, reject) {
            let tx = db.transaction(downloadBlobStoreName, 'readonly');
            let store = tx.objectStore(downloadBlobStoreName);
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
            let tx = db.transaction(downloadBlobStoreName, 'readwrite');
            let store = tx.objectStore(downloadBlobStoreName);
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
    }).catch(function () {
        return false;
    });
}

function create_download_blob_key(prefix) {
    return (prefix || 'blob') + '_' + (new Date()).getTime() + '_' + Math.random().toString(36).slice(2);
}

function ensure_offscreen_document() {
    if ((new Date()).getTime() < offscreenUnavailableUntil) {
        return Promise.reject(new Error('Offscreen document is temporarily unavailable'));
    }
    if (!chrome.offscreen || !chrome.offscreen.createDocument) {
        return Promise.reject(new Error('Chrome offscreen API unavailable'));
    }
    if (offscreenDocumentCreating) {
        return offscreenDocumentCreating;
    }
    offscreenDocumentCreating = clients.matchAll({
        includeUncontrolled: true,
        type: 'window'
    }).then(function (client_list) {
        let offscreen_url = chrome.runtime.getURL('offscreen.html');
        for (let i in client_list) {
            if (client_list[i].url === offscreen_url) {
                return true;
            }
        }
        return chrome.offscreen.createDocument({
            url: 'offscreen.html',
            reasons: ['BLOBS'],
            justification: 'Create short blob URLs for large Weibo image and ZIP downloads.'
        });
    }).then(function () {
        return wait_for_offscreen_ready();
    }).then(function () {
        offscreenDocumentCreating = null;
        return true;
    }).catch(function (e) {
        offscreenDocumentCreating = null;
        throw e;
    });
    return offscreenDocumentCreating;
}

function wait_for_offscreen_ready(tries) {
    tries = tries === undefined ? 100 : tries;
    return new Promise(function (resolve, reject) {
        chrome.runtime.sendMessage({type: 'octo_offscreen_ping'}, function (res) {
            if (res && res.ok) {
                resolve(true);
                return;
            }
            if (tries <= 0) {
                reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Offscreen document is not ready'));
                return;
            }
            setTimeout(function () {
                wait_for_offscreen_ready(tries - 1).then(resolve).catch(reject);
            }, 100);
        });
    });
}

function sleep(ms) {
    return new Promise(function (resolve) {
        setTimeout(resolve, ms);
    });
}

function download_stored_blob_via_offscreen(key, filename, conflictAction) {
    return download_stored_blob_via_offscreen_retry(key, filename, conflictAction, 4);
}

function download_stored_blob_via_offscreen_retry(key, filename, conflictAction, attempts) {
    filename = normalize_download_filename(filename);
    if (!filename) {
        return Promise.reject(new Error('Download filename is empty'));
    }
    attempts = attempts || 1;
    return ensure_offscreen_document().catch(function (e) {
        console.warn('[download:blob:offscreen:error]', {
            filename: filename,
            attemptsLeft: attempts - 1,
            error: e && e.message ? e.message : e
        });
        if (attempts > 1) {
            return sleep(500).then(function () {
                return download_stored_blob_via_offscreen_retry(key, filename, conflictAction, attempts - 1);
            });
        }
        return fallback_or_reject_stored_blob_download(key, filename, conflictAction, e);
    }).then(function (ready) {
        if (typeof ready === 'number') {
            return ready;
        }
        if (!ready) {
            return fallback_or_reject_stored_blob_download(key, filename, conflictAction);
        }
        return new Promise(function (resolve, reject) {
            chrome.runtime.sendMessage({
                type: 'octo_prepare_blob_url',
                key: key,
                filename: filename
            }, function (res) {
                if (chrome.runtime.lastError) {
                    console.warn('[download:blob:prepare:error]', {
                        filename: filename,
                        error: chrome.runtime.lastError.message
                    });
                    if (attempts > 1) {
                        sleep(500).then(function () {
                            return download_stored_blob_via_offscreen_retry(key, filename, conflictAction, attempts - 1);
                        }).then(resolve).catch(reject);
                        return;
                    }
                    fallback_or_reject_stored_blob_download(key, filename, conflictAction, new Error(chrome.runtime.lastError.message)).then(resolve).catch(reject);
                    return;
                }
                if (!res || !res.ok) {
                    console.warn('[download:blob:prepare:error]', {
                        filename: filename,
                        error: res && res.error ? res.error : 'Download create failed'
                    });
                    if (attempts > 1) {
                        sleep(500).then(function () {
                            return download_stored_blob_via_offscreen_retry(key, filename, conflictAction, attempts - 1);
                        }).then(resolve).catch(reject);
                        return;
                    }
                    fallback_or_reject_stored_blob_download(key, filename, conflictAction, new Error(res && res.error ? res.error : 'Download create failed')).then(resolve).catch(reject);
                    return;
                }
                chrome.downloads.download({
                    url: res.url,
                    filename: filename,
                    conflictAction: conflictAction || 'overwrite'
                }, function (download_id) {
                    if (chrome.runtime.lastError || !download_id) {
                        let error_message = chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Download create failed';
                        console.warn('[download:blob:url:error]', {
                            filename: filename,
                            error: error_message
                        });
                        release_offscreen_blob_url(res.url, null);
                        if (attempts > 1) {
                            sleep(500).then(function () {
                                return download_stored_blob_via_offscreen_retry(key, filename, conflictAction, attempts - 1);
                            }).then(resolve).catch(reject);
                            return;
                        }
                        fallback_or_reject_stored_blob_download(key, filename, conflictAction, new Error(error_message)).then(resolve).catch(reject);
                        return;
                    }
                    register_offscreen_blob_download(download_id, res.url, key);
                    resolve(download_id);
                });
            });
        });
    });
}

function fallback_or_reject_stored_blob_download(key, filename, conflictAction, originalError) {
    return idb_get_blob(key).then(function (blob) {
        if (!blob) {
            throw new Error('Download blob missing for fallback');
        }
        if (blob.size > MAX_FALLBACK_DATA_URL_BYTES) {
            throw new Error('Offscreen Blob download failed and data URL fallback is too large: ' + blob.size + (originalError ? ('; original error: ' + (originalError.message || originalError)) : ''));
        }
        return download_stored_blob_as_data_url(key, filename, conflictAction);
    });
}

let offscreenBlobDownloads = {};

function register_offscreen_blob_download(download_id, url, key) {
    offscreenBlobDownloads[download_id] = {
        url: url,
        key: key,
        time: (new Date()).getTime()
    };
    setTimeout(function () {
        release_offscreen_blob_download(download_id);
    }, 10 * 60 * 1000);
}

function release_offscreen_blob_download(download_id) {
    let item = offscreenBlobDownloads[download_id];
    if (!item || !item.url) {
        return;
    }
    release_offscreen_blob_url(item.url, item.key);
    delete offscreenBlobDownloads[download_id];
}

function release_offscreen_blob_url(url, key) {
    if (!url) {
        return;
    }
    chrome.runtime.sendMessage({
        type: 'octo_release_blob_url',
        url: url,
        key: key
    }, function () {
        if (chrome.runtime.lastError) {
            console.warn('[download:blob:release:error]', chrome.runtime.lastError.message);
        }
    });
}

function blob_to_data_url(blob) {
    return blob.arrayBuffer().then(function (buffer) {
        let bytes = new Uint8Array(buffer);
        let binary = '';
        let chunk_size = 0x8000;
        for (let i = 0; i < bytes.length; i += chunk_size) {
            binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunk_size));
        }
        return 'data:' + (blob.type || 'application/octet-stream') + ';base64,' + btoa(binary);
    });
}

function download_stored_blob_as_data_url(key, filename, conflictAction) {
    return idb_get_blob(key).then(function (blob) {
        if (!blob) {
            throw new Error('Download blob missing for fallback');
        }
        if (blob.size > MAX_FALLBACK_DATA_URL_BYTES) {
            throw new Error('Blob URL download failed and fallback is too large: ' + blob.size);
        }
        return blob_to_data_url(blob);
    }).then(function (data_url) {
        return new Promise(function (resolve, reject) {
            chrome.downloads.download({
                url: data_url,
                filename: filename,
                conflictAction: conflictAction || 'overwrite'
            }, function (download_id) {
                idb_delete_blob(key);
                if (chrome.runtime.lastError || !download_id) {
                    reject(new Error(chrome.runtime.lastError ? chrome.runtime.lastError.message : 'Fallback download create failed'));
                    return;
                }
                resolve(download_id);
            });
        });
    }).catch(function (e) {
        idb_delete_blob(key);
        throw e;
    });
}

function download_blob_via_offscreen(blob, filename, conflictAction) {
    let key = create_download_blob_key('blob');
    return idb_put_blob(key, blob).then(function () {
        return download_stored_blob_via_offscreen(key, filename, conflictAction);
    }).catch(function (e) {
        idb_delete_blob(key);
        throw e;
    });
}

let crc32Table = null;
let MAX_ZIP_BLOB_BYTES = 128 * 1024 * 1024;
let MAX_FALLBACK_DATA_URL_BYTES = 10 * 1024 * 1024;
let MAX_PACKAGE_FETCH_CONCURRENT = 3;

function get_crc32_table() {
    if (crc32Table) {
        return crc32Table;
    }
    crc32Table = [];
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) {
            c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
        }
        crc32Table[n] = c >>> 0;
    }
    return crc32Table;
}

function crc32(bytes) {
    let table = get_crc32_table();
    let crc = 0 ^ (-1);
    for (let i = 0; i < bytes.length; i++) {
        crc = (crc >>> 8) ^ table[(crc ^ bytes[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
}

function zip_time_date(date) {
    return {
        time: ((date.getHours() & 0x1f) << 11) | ((date.getMinutes() & 0x3f) << 5) | ((Math.floor(date.getSeconds() / 2)) & 0x1f),
        date: (((date.getFullYear() - 1980) & 0x7f) << 9) | (((date.getMonth() + 1) & 0x0f) << 5) | (date.getDate() & 0x1f)
    };
}

function concat_uint8_arrays(chunks, total_length) {
    let output = new Uint8Array(total_length);
    let offset = 0;
    for (let i in chunks) {
        output.set(chunks[i], offset);
        offset += chunks[i].length;
    }
    return output;
}

function build_zip(files) {
    let encoder = new TextEncoder();
    let now = zip_time_date(new Date());
    let local_chunks = [];
    let central_chunks = [];
    let offset = 0;
    let total_length = 0;
    let central_length = 0;

    for (let i in files) {
        let file = files[i];
        let name_bytes = encoder.encode(file.name);
        let data = file.bytes;
        let crc = crc32(data);
        let local = new Uint8Array(30 + name_bytes.length);
        let local_view = new DataView(local.buffer);
        local_view.setUint32(0, 0x04034b50, true);
        local_view.setUint16(4, 20, true);
        local_view.setUint16(6, 0x0800, true);
        local_view.setUint16(8, 0, true);
        local_view.setUint16(10, now.time, true);
        local_view.setUint16(12, now.date, true);
        local_view.setUint32(14, crc, true);
        local_view.setUint32(18, data.length, true);
        local_view.setUint32(22, data.length, true);
        local_view.setUint16(26, name_bytes.length, true);
        local_view.setUint16(28, 0, true);
        local.set(name_bytes, 30);
        local_chunks.push(local, data);
        total_length += local.length + data.length;

        let central = new Uint8Array(46 + name_bytes.length);
        let central_view = new DataView(central.buffer);
        central_view.setUint32(0, 0x02014b50, true);
        central_view.setUint16(4, 20, true);
        central_view.setUint16(6, 20, true);
        central_view.setUint16(8, 0x0800, true);
        central_view.setUint16(10, 0, true);
        central_view.setUint16(12, now.time, true);
        central_view.setUint16(14, now.date, true);
        central_view.setUint32(16, crc, true);
        central_view.setUint32(20, data.length, true);
        central_view.setUint32(24, data.length, true);
        central_view.setUint16(28, name_bytes.length, true);
        central_view.setUint16(30, 0, true);
        central_view.setUint16(32, 0, true);
        central_view.setUint16(34, 0, true);
        central_view.setUint16(36, 0, true);
        central_view.setUint32(38, 0, true);
        central_view.setUint32(42, offset, true);
        central.set(name_bytes, 46);
        central_chunks.push(central);
        central_length += central.length;
        offset += local.length + data.length;
    }

    let end = new Uint8Array(22);
    let end_view = new DataView(end.buffer);
    end_view.setUint32(0, 0x06054b50, true);
    end_view.setUint16(4, 0, true);
    end_view.setUint16(6, 0, true);
    end_view.setUint16(8, files.length, true);
    end_view.setUint16(10, files.length, true);
    end_view.setUint32(12, central_length, true);
    end_view.setUint32(16, total_length, true);
    end_view.setUint16(20, 0, true);

    return concat_uint8_arrays(local_chunks.concat(central_chunks, [end]), total_length + central_length + end.length);
}

function build_zip_blob(files) {
    let encoder = new TextEncoder();
    let now = zip_time_date(new Date());
    let local_parts = [];
    let central_chunks = [];
    let offset = 0;
    let central_length = 0;
    let chain = Promise.resolve();

    for (let i in files) {
        (function (file) {
            chain = chain.then(function () {
                return zip_file_data_part(file).then(function (data_part) {
                    let name_bytes = encoder.encode(file.name);
                    let data_length = file.size !== undefined ? file.size : (file.bytes ? file.bytes.length : data_part.size);
                    let crc = file.crc !== undefined ? file.crc : (file.bytes ? crc32(file.bytes) : 0);
                    let local = new Uint8Array(30 + name_bytes.length);
                    let local_view = new DataView(local.buffer);
                    local_view.setUint32(0, 0x04034b50, true);
                    local_view.setUint16(4, 20, true);
                    local_view.setUint16(6, 0x0800, true);
                    local_view.setUint16(8, 0, true);
                    local_view.setUint16(10, now.time, true);
                    local_view.setUint16(12, now.date, true);
                    local_view.setUint32(14, crc, true);
                    local_view.setUint32(18, data_length, true);
                    local_view.setUint32(22, data_length, true);
                    local_view.setUint16(26, name_bytes.length, true);
                    local_view.setUint16(28, 0, true);
                    local.set(name_bytes, 30);
                    local_parts.push(local, data_part);

                    let central = new Uint8Array(46 + name_bytes.length);
                    let central_view = new DataView(central.buffer);
                    central_view.setUint32(0, 0x02014b50, true);
                    central_view.setUint16(4, 20, true);
                    central_view.setUint16(6, 20, true);
                    central_view.setUint16(8, 0x0800, true);
                    central_view.setUint16(10, 0, true);
                    central_view.setUint16(12, now.time, true);
                    central_view.setUint16(14, now.date, true);
                    central_view.setUint32(16, crc, true);
                    central_view.setUint32(20, data_length, true);
                    central_view.setUint32(24, data_length, true);
                    central_view.setUint16(28, name_bytes.length, true);
                    central_view.setUint16(30, 0, true);
                    central_view.setUint16(32, 0, true);
                    central_view.setUint16(34, 0, true);
                    central_view.setUint16(36, 0, true);
                    central_view.setUint32(38, 0, true);
                    central_view.setUint32(42, offset, true);
                    central.set(name_bytes, 46);
                    central_chunks.push(central);
                    central_length += central.length;
                    offset += local.length + data_length;
                });
            });
        })(files[i]);
    }

    return chain.then(function () {
        let end = new Uint8Array(22);
        let end_view = new DataView(end.buffer);
        end_view.setUint32(0, 0x06054b50, true);
        end_view.setUint16(4, 0, true);
        end_view.setUint16(6, 0, true);
        end_view.setUint16(8, files.length, true);
        end_view.setUint16(10, files.length, true);
        end_view.setUint32(12, central_length, true);
        end_view.setUint32(16, offset, true);
        end_view.setUint16(20, 0, true);
        return new Blob(local_parts.concat(central_chunks, [end]), {type: 'application/zip'});
    });
}

function zip_file_data_part(file) {
    if (file.bytes) {
        return Promise.resolve(file.bytes);
    }
    if (file.blob) {
        return Promise.resolve(file.blob);
    }
    if (file.key) {
        return idb_get_blob(file.key).then(function (blob) {
            if (!blob) {
                throw new Error('ZIP item blob missing: ' + file.name);
            }
            return blob;
        });
    }
    return Promise.reject(new Error('ZIP item has no data: ' + (file.name || 'unknown')));
}

function zip_entry_name(name, fallback_index, used) {
    let cleaned = reg_filename((name || '').toString());
    if (!cleaned) {
        cleaned = 'image_' + pad_number(fallback_index, 4) + '.jpg';
    }
    let dot = cleaned.lastIndexOf('.');
    let base = dot > 0 ? cleaned.substring(0, dot) : cleaned;
    let suffix = dot > 0 ? cleaned.substring(dot) : '';
    let candidate = cleaned;
    let duplicate = 2;
    while (used[candidate]) {
        candidate = base + '_' + duplicate + suffix;
        duplicate++;
    }
    used[candidate] = true;
    return candidate;
}

function pad_number(num, length) {
    num = parseInt(num, 10) || 0;
    let str = num.toString();
    while (str.length < length) {
        str = '0' + str;
    }
    return str;
}

function package_base_filename(album_id, folder) {
    let detail = window['albumDetail' + album_id] || {};
    let base = reg_filename(clean_user_name(detail.name) || '');
    if (!base) {
        base = reg_filename(clean_user_name((folder || '').toString().split('_')[0] || '') || '');
    }
    if (!base) {
        base = reg_filename((window['uid' + album_id] || album_id || 'package').toString()) || 'package';
    }
    return base;
}

function package_filename(folder, index, album_id, part, part_total) {
    let name = package_base_filename(album_id, folder) + '_' + pad_number(index, 3);
    if (part_total && part_total > 1) {
        name += '_' + pad_number(part, 2);
    }
    name += '.zip';
    return normalize_download_filename(base_folder + '/' + folder + '/' + name);
}

function zip_file_estimated_size(file) {
    let name = file && file.name ? file.name.toString() : '';
    let bytes = file && file.bytes ? file.bytes.length : (file && file.size ? file.size : 0);
    return bytes + name.length * 4 + 128;
}

function store_zip_download_part(files) {
    return build_zip_blob(files).then(function (blob) {
        let key = create_download_blob_key('zip');
        return idb_put_blob(key, blob).then(function () {
            return {
                key: key,
                count: count_zip_image_files(files),
                bytes: blob.size
            };
        });
    });
}

function count_zip_image_files(files) {
    let count = 0;
    for (let i in files || []) {
        if (!files[i].isLog) {
            count++;
        }
    }
    return count;
}

function name_zip_download_parts(parts, folder, index, album_id) {
    for (let i in parts) {
        parts[i].filename = package_filename(folder, index, album_id, parseInt(i, 10) + 1, parts.length);
    }
    return parts;
}

function cleanup_zip_download_parts(parts) {
    for (let i in (parts || [])) {
        if (parts[i] && parts[i].key) {
            idb_delete_blob(parts[i].key);
        }
    }
}

function add_package_total(album_id, extra) {
    extra = parseInt(extra, 10) || 0;
    if (extra > 0) {
        window['package_total_extra' + album_id] = (window['package_total_extra' + album_id] || 0) + extra;
        window['package_total' + album_id] = (window['package_total' + album_id] || 0) + extra;
    }
}

function download_zip_package(pack, callback) {
    let album_id = pack.album_id;
    let startStamp = (new Date()).getTime();
    window['downCurrent'] =  window['downCurrent'] + 1;
    window['package_current_index' + album_id] = pack.index;
    window['package_current_done' + album_id] = 0;
    window['package_current_total' + album_id] = pack.items.length;
    set_album_activity(album_id, '正在抓取第 ' + pack.index + ' 包图片 0 / ' + pack.items.length, 'running');
    emit_package_progress(album_id);
    let current_files = [];
    let current_size = 0;
    let download_parts = [];
    let used_names = {};
    let fail_count = 0;
    let success_count = 0;
    let zip_name = package_filename(pack.folder, pack.index, album_id);
    function flush_current_part() {
        if (current_files.length === 0) {
            return Promise.resolve();
        }
        let files_to_store = current_files;
        current_files = [];
        current_size = 0;
        set_album_activity(album_id, '正在生成第 ' + pack.index + ' 包的第 ' + (download_parts.length + 1) + ' 个 ZIP（' + files_to_store.length + ' 张）', 'running');
        emit_album_progress(album_id);
        return store_zip_download_part(files_to_store).then(function (part) {
            download_parts.push(part);
        });
    }
    let chain = Promise.resolve();
    for (let i in pack.items) {
        (function (item, index) {
            chain = chain.then(function () {
                return fetch_weibo_image_blob(item.url, album_id, item.name).then(function (blob) {
                    return blob.arrayBuffer();
                }).then(function (buffer) {
                    let file = {
                        name: zip_entry_name(item.name, parseInt(index, 10) + 1, used_names),
                        bytes: new Uint8Array(buffer)
                    };
                    let estimated_size = zip_file_estimated_size(file);
                    let should_flush = current_files.length > 0 && current_size + estimated_size > MAX_ZIP_BLOB_BYTES;
                    let add_file = function () {
                        current_files.push(file);
                        current_size += estimated_size;
                        success_count++;
                        record_package_item_processed(album_id);
                    };
                    if (should_flush) {
                        return flush_current_part().then(add_file);
                    }
                    add_file();
                    return true;
                }).catch(function (e) {
                    fail_count++;
                    console.warn('[download:zip:item:error]', {
                        album_id: album_id,
                        url: item.url,
                        filename: item.name,
                        error: e && e.message ? e.message : e
                    });
                    record_package_item_processed(album_id);
                });
            });
        })(pack.items[i], i);
    }
    chain.then(function () {
        return flush_current_part();
    }).then(function () {
        if (download_parts.length === 0) {
            window['downCurrent'] =  window['downCurrent'] - 1;
            clear_package_current(album_id);
            record_download_progress(album_id, 0, fail_count || pack.items.length);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        name_zip_download_parts(download_parts, pack.folder, pack.index, album_id);
        if (download_parts.length > 1) {
            add_package_total(album_id, download_parts.length - 1);
            set_album_activity(album_id, '第 ' + pack.index + ' 包较大，已自动拆成 ' + download_parts.length + ' 个 ZIP', 'running');
            emit_album_progress(album_id);
        }
        console.log('[download:zip:start]', {
            album_id: album_id,
            filename: zip_name,
            files: success_count,
            failed: fail_count,
            parts: download_parts.length
        });
        download_zip_parts(album_id, pack, download_parts, fail_count, startStamp, callback);
    }).catch(function (e) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        clear_package_current(album_id);
        cleanup_zip_download_parts(download_parts);
        set_album_activity(album_id, 'ZIP 生成失败：' + (e && e.message ? e.message : e), 'error');
        console.warn('[download:zip:error]', {
            album_id: album_id,
            filename: zip_name,
            error: e && e.message ? e.message : e
        });
        record_download_progress(album_id, 0, pack.items.length);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

function download_finalized_zip_package(pack, callback) {
    let album_id = pack.album_id;
    if (is_album_removed(album_id)) {
        typeof callback === 'function' && callback();
        return;
    }
    if (is_album_paused(album_id)) {
        pack.zipSaveAttempts = 0;
        arrayQueue.unshift({type: 'zipSave', data: pack});
        typeof callback === 'function' && callback();
        return;
    }
    let startStamp = (new Date()).getTime();
    window['downCurrent'] = window['downCurrent'] + 1;
    set_album_activity(album_id, '正在生成第 ' + pack.index + ' 包 ZIP（' + pack.files.length + ' 张）', 'running');
    emit_album_progress(album_id);
    pack.files = append_package_failure_log(album_id, pack);
    create_zip_download_parts_from_files(album_id, pack).then(function (download_parts) {
        if (is_album_paused(album_id)) {
            cleanup_zip_download_parts(download_parts);
            arrayQueue.unshift({type: 'zipSave', data: pack});
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return null;
        }
        if (is_album_removed(album_id)) {
            cleanup_zip_download_parts(download_parts);
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return null;
        }
        if (download_parts.length === 0) {
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            clear_package_current(album_id);
            record_package_done(album_id, 1);
            record_download_progress(album_id, 0, pack.failed || pack.scheduled || 0);
            mark_package_finished(album_id, pack);
            delete_package_builder(album_id, pack.index);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return null;
        }
        name_zip_download_parts(download_parts, pack.folder, pack.index, album_id);
        if (download_parts.length > 1) {
            add_package_total(album_id, download_parts.length - 1);
            set_album_activity(album_id, '第 ' + pack.index + ' 包过大，已保护性拆成 ' + download_parts.length + ' 个 ZIP', 'running');
            emit_album_progress(album_id);
        }
        console.log('[download:zip:start]', {
            album_id: album_id,
            files: pack.files.length,
            failed: pack.failed,
            parts: download_parts.length
        });
        download_zip_parts(album_id, pack, download_parts, pack.failed || 0, startStamp, function () {
            delete_package_builder(album_id, pack.index);
            typeof callback === 'function' && callback();
        });
        return true;
    }).catch(function (e) {
        window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
        clear_package_current(album_id);
        set_album_activity(album_id, 'ZIP 生成失败：' + (e && e.message ? e.message : e), 'error');
        console.warn('[download:zip:error]', {
            album_id: album_id,
            index: pack.index,
            error: e && e.message ? e.message : e
        });
        record_package_done(album_id, 1);
        record_download_progress(album_id, 0, pack.scheduled || pack.files.length || 0);
        mark_package_finished(album_id, pack);
        delete_package_builder(album_id, pack.index);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

function append_package_failure_log(album_id, pack) {
    let failed_items = pack.failedItems || [];
    if (failed_items.length === 0) {
        return pack.files || [];
    }
    let detail = window['albumDetail' + album_id] || {};
    let lines = [
        'Octo Weibo Album download failure log',
        '用户: ' + (detail.name || window['uid' + album_id] || ''),
        '相册: ' + (detail.caption || album_id || ''),
        '包号: ' + (pack.index || ''),
        '失败数量: ' + failed_items.length,
        '生成时间: ' + (new Date()).toISOString(),
        ''
    ];
    for (let i in failed_items) {
        let item = failed_items[i];
        lines.push('[' + (parseInt(i, 10) + 1) + ']');
        lines.push('文件: ' + (item.name || ''));
        lines.push('URL: ' + (item.url || ''));
        lines.push('错误: ' + (item.error || 'unknown'));
        lines.push('时间: ' + (item.time || ''));
        lines.push('');
    }
    let bytes = new TextEncoder().encode(lines.join('\n'));
    let used = {};
    for (let j in (pack.files || [])) {
        used[(pack.files[j].name || '').toString()] = true;
    }
    let log_file = {
        name: zip_entry_name('download_failures.txt', 1, used),
        bytes: bytes,
        size: bytes.length,
        crc: crc32(bytes),
        isLog: true
    };
    return (pack.files || []).concat([log_file]);
}

function create_zip_download_parts_from_files(album_id, pack) {
    let parts = [];
    let current_files = [];
    let current_size = 0;
    let chain = Promise.resolve();
    function flush_part() {
        if (current_files.length === 0) {
            return Promise.resolve();
        }
        let files_to_store = current_files;
        current_files = [];
        current_size = 0;
        set_album_activity(album_id, '正在写入第 ' + pack.index + ' 包的第 ' + (parts.length + 1) + ' 个 ZIP（' + files_to_store.length + ' 张）', 'running');
        emit_album_progress(album_id);
        return store_zip_download_part(files_to_store).then(function (part) {
            parts.push(part);
        });
    }
    for (let i in pack.files) {
        let file = pack.files[i];
        let estimated_size = zip_file_estimated_size(file);
        if (current_files.length > 0 && current_size + estimated_size > MAX_ZIP_BLOB_BYTES) {
            chain = chain.then(flush_part);
        }
        chain = chain.then(function () {
            if (is_album_paused_or_removed(album_id)) {
                return true;
            }
            current_files.push(file);
            current_size += estimated_size;
            return true;
        });
    }
    return chain.then(flush_part).then(function () {
        return parts;
    });
}

function delete_package_builder(album_id, index) {
    let builders = get_package_builders(album_id);
    if (builders[index]) {
        cleanup_package_file_blobs(builders[index].files);
        builders[index].files = [];
        delete builders[index];
    }
}

function cleanup_package_file_blobs(files) {
    for (let i in (files || [])) {
        if (files[i] && files[i].key) {
            idb_delete_blob(files[i].key);
        }
    }
}

function download_zip_parts(album_id, pack, parts, fail_count, startStamp, callback) {
    let index = 0;
    function next() {
        if (is_album_paused(album_id) && !is_album_removed(album_id)) {
            cleanup_zip_download_parts(parts.slice(index));
            arrayQueue.unshift({type: 'zipSave', data: pack});
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            scheduleQueueDrain();
            return;
        }
        if (is_album_removed(album_id)) {
            cleanup_zip_download_parts(parts.slice(index));
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        if (index >= parts.length) {
            window['downCurrent'] =  window['downCurrent'] - 1;
            clear_package_current(album_id);
            mark_package_finished(album_id, pack);
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        let part = parts[index];
        index++;
        set_album_activity(album_id, '正在保存 ZIP ' + index + ' / ' + parts.length + '：' + part.filename, 'running');
        emit_album_progress(album_id);
        download_stored_blob_via_offscreen(part.key, part.filename, 'overwrite').then(function (download_id) {
            if (is_album_paused(album_id) && !is_album_removed(album_id)) {
                cancel_chrome_download(download_id);
                cleanup_zip_download_parts(parts.slice(index));
                arrayQueue.unshift({type: 'zipSave', data: pack});
                window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
                scheduleQueueDrain();
                return;
            }
            if (is_album_removed(album_id)) {
                cancel_chrome_download(download_id);
                cleanup_zip_download_parts(parts.slice(index));
                window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
                typeof callback === 'function' && callback();
                scheduleQueueDrain();
                return;
            }
            let final_fail = index === parts.length ? fail_count : 0;
            console.log('[download:zip:created]', {
                album_id: album_id,
                downloadId: download_id,
                filename: part.filename,
                files: part.count,
                bytes: part.bytes,
                elapsed: (new Date()).getTime() - startStamp
            });
            record_package_done(album_id, 1);
            record_download_progress(album_id, part.count, final_fail);
            next();
        }).catch(function (e) {
            let message = e && e.message ? e.message : e;
            set_album_activity(album_id, 'ZIP 保存失败，已暂停并保留当前包：' + message, 'error');
            console.warn('[download:zip:download:error]', {
                album_id: album_id,
                filename: part.filename,
                error: message
            });
            cleanup_zip_download_parts([part].concat(parts.slice(index)));
            window['downCurrent'] = Math.max(0, window['downCurrent'] - 1);
            pack.zipSaveAttempts = (pack.zipSaveAttempts || 0) + 1;
            if (pack.zipSaveAttempts <= 3 && !is_album_paused_or_removed(album_id)) {
                set_album_activity(album_id, 'ZIP 保存失败，准备第 ' + pack.zipSaveAttempts + ' 次重试：' + message, 'error');
                setTimeout(function () {
                    if (!is_album_paused_or_removed(album_id)) {
                        arrayQueue.unshift({type: 'zipSave', data: pack});
                        scheduleQueueDrain();
                    }
                }, 1500);
            } else {
                window['album_stopped_' + album_id] = true;
                set_album_activity(album_id, 'ZIP 保存连续失败，已暂停。当前包未计失败，可点击继续重试：' + message, 'error');
            }
            emit_album_progress(album_id);
            scheduleQueueDrain();
        });
    }
    next();
}

function mark_package_finished(album_id, pack) {
    let count = parseInt(pack && pack.scheduled, 10) || parseInt(pack && pack.files ? pack.files.length : 0, 10) || 0;
    window['package_prefetched_count_' + album_id] = Math.max(0, (window['package_prefetched_count_' + album_id] || 0) - count);
    setTimeout(function () {
        maybe_resume_package_page_fetch(album_id);
    }, 0);
}

function cancel_chrome_download(download_id) {
    if (!download_id || !chrome.downloads || !chrome.downloads.cancel) {
        return;
    }
    chrome.downloads.cancel(download_id, function () {
        if (chrome.runtime.lastError) {
            console.warn('[download:cancel:error]', {
                downloadId: download_id,
                error: chrome.runtime.lastError.message
            });
        }
    });
}

function record_download_progress(album_id, suc_delta, fail_delta) {
    if(window['download_suc' + album_id] > -1) {
        window['download_suc' + album_id] = window['download_suc' + album_id] + (parseInt(suc_delta, 10) || 0);
        window['download_fail' + album_id] = window['download_fail' + album_id] + (parseInt(fail_delta, 10) || 0);
        emit_album_progress(album_id);
    }
}

function record_package_done(album_id, count) {
    if (!is_package_download(album_id)) {
        return;
    }
    window['package_done' + album_id] = (window['package_done' + album_id] || 0) + (parseInt(count, 10) || 0);
    clear_package_current(album_id);
}

function record_package_item_processed(album_id, builder) {
    if (!is_package_download(album_id)) {
        return;
    }
    window['package_processed' + album_id] = (window['package_processed' + album_id] || 0) + 1;
    if (builder) {
        window['package_current_index' + album_id] = builder.index;
        window['package_current_done' + album_id] = builder.processed;
        window['package_current_total' + album_id] = expected_package_item_count(album_id, builder);
    } else {
        window['package_current_done' + album_id] = (window['package_current_done' + album_id] || 0) + 1;
    }
    set_album_activity(
        album_id,
        '正在抓取第 ' + (window['package_current_index' + album_id] || 0) + ' 包图片 ' + (window['package_current_done' + album_id] || 0) + ' / ' + (window['package_current_total' + album_id] || 0),
        'running'
    );
    emit_package_progress(album_id);
}

function clear_package_current(album_id) {
    window['package_current_index' + album_id] = 0;
    window['package_current_done' + album_id] = 0;
    window['package_current_total' + album_id] = 0;
}

function emit_package_progress(album_id) {
    if (!is_package_download(album_id) || window['download_suc' + album_id] < 0) {
        return;
    }
    emit_album_progress(album_id);
}

function download_blob_direct(blob, url, name, album_id, startStamp, callback, progress) {
    download_blob_via_offscreen(blob, name, 'overwrite').then(function (download_id) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        if (is_album_removed(album_id)) {
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        console.log('[download:created]', {
            album_id: album_id,
            downloadId: download_id,
            url: url,
            filename: name,
            elapsed: (new Date()).getTime() - startStamp,
            via: 'blob'
        });
        if (!window['download_folder' + album_id]) {
            window['download_folder' + album_id] = download_id ? download_id : null;
        }
        let success_delta = progress && progress.success !== undefined ? progress.success : 1;
        let fail_delta = progress && progress.fail !== undefined ? progress.fail : 0;
        if (progress && progress.package) {
            record_package_done(album_id, progress.package);
        }
        record_download_progress(album_id, success_delta, fail_delta);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    }).catch(function (e) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        if (is_album_removed(album_id)) {
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
        console.warn('[download:error]', {
            album_id: album_id,
            url: url,
            filename: name,
            error: e && e.message ? e.message : e,
            via: 'blob'
        });
        if (progress && progress.package) {
            clear_package_current(album_id);
        }
        let failure_delta = progress && progress.failure !== undefined ? progress.failure : 1;
        record_download_progress(album_id, 0, failure_delta);
        typeof callback === 'function' && callback();
        scheduleQueueDrain();
    });
}

function download_direct(download_options, url, name, album_id, startStamp, callback, progress) {
    chrome.downloads.download(download_options, function (res) {
        window['downCurrent'] =  window['downCurrent'] - 1;
        if (is_album_removed(album_id)) {
            typeof callback === 'function' && callback();
            scheduleQueueDrain();
            return;
        }
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
        let success_delta = progress && progress.success !== undefined ? progress.success : 1;
        let fail_delta = progress && progress.fail !== undefined ? progress.fail : 0;
        let failure_delta = progress && progress.failure !== undefined ? progress.failure : 1;
        if (res && !chrome.runtime.lastError) {
            if (progress && progress.package) {
                record_package_done(album_id, progress.package);
            }
            record_download_progress(album_id, success_delta, fail_delta);
        } else {
            if (progress && progress.package) {
                clear_package_current(album_id);
            }
            record_download_progress(album_id, 0, failure_delta);
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
        let state = delta.state.current || delta.state.previous;
        console.log('[download:onChanged:state]', {
            downloadId: delta.id,
            state: state
        });
        if (state === 'complete' || state === 'interrupted') {
            release_offscreen_blob_download(delta.id);
        }
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
    this.unshift = function(element){
        arr.unshift(element);
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
    down_allow = value !== undefined && value !== null ? value : 1;
    config_set({'down_allow':down_allow});
});
config_get('package_download', function (value) {
    if (value === undefined || value === null) {
        config_set({'package_download': 0});
    }
});
config_get('package_size_migrated_500', function (migrated) {
    config_get('package_size', function (value) {
        let size = normalize_package_size(value);
        if (!migrated && (value === undefined || value === null || parseInt(value, 10) === 50)) {
            size = 500;
        }
        config_set({'package_size': size, 'package_size_migrated_500': 1});
    });
});

function enqueue_download_task(task, priority) {
    if (priority) {
        arrayQueue.unshift(task);
    } else {
        arrayQueue.push(task);
    }
    if (task && (task.type === 'down' || task.type === 'zip' || task.type === 'zipItem' || task.type === 'zipSave') && !window['down_stopped']) {
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
        if (task.type === 'zip' && task.data && task.data.album_id == album_id) {
            continue;
        }
        if (task.type === 'zipItem' && task.data && task.data.album_id == album_id) {
            continue;
        }
        if (task.type === 'zipSave' && task.data && task.data.album_id == album_id) {
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
    let waiting_for_active = false;
    let skipped = 0;
    let initial_length = arrayQueue.length();
    while (window['downCurrent'] < window['down_allow'] && arrayQueue.length() > 0 && skipped < initial_length) {
        let queue = arrayQueue.pop();
        if (!queue) {
            break;
        }
        let album_id = task_album_id(queue);
        if (album_id && is_album_removed(album_id)) {
            continue;
        }
        if (album_id && is_album_paused(album_id)) {
            arrayQueue.push(queue);
            skipped++;
            continue;
        }
        if(queue.type === 'down'){
            started++;
            down(...queue.data);
        }else if(queue.type === 'zip'){
            started++;
            download_zip_package(queue.data);
        }else if(queue.type === 'zipItem'){
            if ((window['packageActiveFetches'] || 0) >= MAX_PACKAGE_FETCH_CONCURRENT) {
                arrayQueue.push(queue);
                skipped++;
                continue;
            }
            if (queue.data && queue.data.index && has_earlier_unfinished_package(queue.data.album_id, queue.data.index)) {
                arrayQueue.push(queue);
                skipped++;
                continue;
            }
            if (queue.data && !queue.data.index && has_closed_package(queue.data.album_id)) {
                arrayQueue.push(queue);
                skipped++;
                continue;
            }
            started++;
            process_package_item(queue.data);
        }else if(queue.type === 'zipSave'){
            started++;
            download_finalized_zip_package(queue.data);
        }else if(queue.type === 'finish'){
            if (window['downCurrent'] > 0 || arrayQueue.length() > 0 || has_unfinished_package_builders(queue.data)) {
                arrayQueue.push(queue);
                waiting_for_active = true;
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
    if (!waiting_for_active && arrayQueue.length() > 0 && window['downCurrent'] < window['down_allow'] && !(started === 0 && skipped > 0)) {
        scheduleQueueDrain();
    }
}

function has_unfinished_package_builders(album_id) {
    if (!is_package_download(album_id)) {
        return false;
    }
    let builders = get_package_builders(album_id);
    for (let index in builders) {
        let builder = builders[index];
        if (builder && builder.scheduled > 0) {
            return true;
        }
    }
    return false;
}

function task_album_id(task) {
    if (!task) {
        return null;
    }
    if (task.type === 'down' && task.data) {
        return task.data[2];
    }
    if ((task.type === 'zip' || task.type === 'zipItem' || task.type === 'zipSave') && task.data) {
        return task.data.album_id;
    }
    if (task.type === 'finish') {
        return task.data;
    }
    return null;
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
