document.addEventListener('DOMContentLoaded', function () {
    set_loading_text('正在识别当前微博页面和当前用户');
    events.current_page();
    set_download_status('idle');

    $('body').on('click', '.item', function (elm) {

        let ratio = $("#ratio").val();
        let open = $("#open-folder:checked").val();
        let down_allow = $("#con-current").val();
        let package_download = $("#package-download").prop('checked') ? 1 : 0;
        let package_size = normalize_package_size($("#package-size").val());

        $(this).addClass('is-downloading');
        $(this).find('.complete').text('等待下载');
        set_download_status('running');

        let album_id = $(this).data('albid');
        let uid = $(this).data('uid');
        let caption = $(this).data('caption');
        let type = $(this).data('type');
        let name = $(this).data('name');
        let count = $(this).data('count');

        let data = {
            album_id: album_id,
            uid: uid,
            caption: caption,
            type: type,
            name: name,
            count: count,
            ratio:ratio,
            open:open,
            down_allow:down_allow,
            package_download: package_download,
            package_size: package_size,
        };
        events.down_album(data)
    });

    $('body').on('change', 'select.album-select', function (elm) {
        let uid2 = $(this).val();
        let name2 = $.trim($(this).find('option:selected').text());
        // $('.user-select').html(uid2+name2);
        set_loading_text('正在切换账号并获取相册列表');
        $('.album-loading').show();
        $('.album-list').hide();
        events.album_get({uid: uid2, name: name2})
    });

    $('body').on('click', '.to-album', function () {
        let uid = $(this).data('uid') || $(this).data('alid');
        window.open('https://photo.weibo.com/' + uid + '/albums');
    });
    $('body').on('click', '.album-info', function () {
        let album_id = $(this).data('alid');
        let uid = $(this).data('uid');
        let type = $(this).data('type');
        if(type == 3){
            window.open('https://photo.weibo.com/'+uid+'/talbum/index');
        }else{
            window.open('https://photo.weibo.com/'+uid+'/albums/detail/album_id/'+album_id);
        }
    });

    $("#author").click(function (event) {
        event.preventDefault();
        window.open('https://blog.liuguofeng.com/p/5370')
    });

    $("#open-folder").click(function(){
        let open_folder = $("#open-folder").prop('checked');
        events.config_set({'open_folder':open_folder?1:0})
    });
    $("#con-current").change(function(){
        let down_allow = $("#con-current").val();
        events.config_set({'down_allow':down_allow});
        events.window_set({'down_allow':down_allow});
    });
    $("#package-download").change(function(){
        let package_download = $("#package-download").prop('checked') ? 1 : 0;
        events.config_set({'package_download': package_download});
        toggle_package_size();
    });
    $("#package-size").change(function(){
        let package_size = normalize_package_size($("#package-size").val());
        $("#package-size").val(package_size);
        events.config_set({'package_size': package_size});
    });
    $('body').on('click', '.process-li-stop', function () {
        let $li = $(this).closest('.process-li');
        let album_id = $li.data('albid');
        let action = $(this).data('action');
        if (action === 'resume') {
            events.album_resume(album_id, function(res){
                $li.find('.process-li-stop').val('暂停').data('action', 'stop').removeClass('is-resume');
                update_process_progress($li, res ? (res.suc||0) : 0, res ? (res.total||0) : 0, res ? res.package_progress : null, res ? res.activity : null);
            });
        } else {
            events.album_stop(album_id, function(res){
                $li.find('.process-li-stop').val('继续').data('action', 'resume').addClass('is-resume');
                if (res) {
                    update_process_progress($li, res.suc||0, res.total||0, res.package_progress, res.activity);
                }
            });
        }
    });
    $('body').on('click', '.process-li-delete', function () {
        let $li = $(this).closest('.process-li');
        let album_id = $li.data('albid');
        if (confirm('确定删除"' + ($li.find('.album-info span').text() || album_id) + '"的下载记录？')) {
            events.album_remove(album_id, function(){
                $li.remove();
                if ($('.process-body').children().length === 0) {
                    $('.process').hide();
                }
            });
        }
    });
    $(".warning-icon").mouseover(function(){
        $(".warning-more").slideDown();
    });
    $(".warning-icon").mouseleave(function(){
        $(".warning-more").slideUp();
    });
    $(".warning-toggle").click(function(){
        let expanded = $(this).attr('aria-expanded') === 'true';
        $(this).attr('aria-expanded', expanded ? 'false' : 'true').toggleClass('is-open', !expanded);
        $(".warning-more").slideToggle(120);
    });

    events.config_get('open_folder',function(res){
        $("#open-folder").prop('checked',res==1?true:false)
    });
    events.config_get('down_allow',function(res){
        $("#con-current").val(res || 1)
    });
    events.config_get('package_download',function(res){
        $("#package-download").prop('checked',res==1?true:false);
        toggle_package_size();
    });
    events.config_get('package_size',function(res){
        $("#package-size").val(normalize_package_size(res));
    });
    events.window_get('download_state',function(res){
        set_download_status(res || 'idle');
    });
    // restore progress on popup open
    events.get_all_progress(function(progress){
        if (!progress || progress.length === 0) return;
        $('.process-body').empty();
        for (let i in progress) {
            let p = progress[i];
            let html = render_process_li(p.album_id, p.uid, p, p.suc||0, p.total||0, p.finished, p.stopped);
            $('.process-body').append(html);
        }
    });
});

function render_process_li(album_id, uid, detail, suc, total, finished, stopped) {
    let html = '';
    let package_progress = normalize_package_progress(detail.package_progress);
    let activity = normalize_activity(detail.activity);
    let fail = parseInt(detail.fail, 10) || 0;
    html += '<div class="process-li" id="process' + album_id + '" data-albid="' + album_id + '" data-uid="' + uid + '">';
    html += '<div class="album-info" data-uid="'+uid+'" data-alid="'+album_id+'" data-type="'+(detail.type||'')+'">';
    html += '<img class="process-pic" src="' + escape_attr(detail.cover_pic||'') + '"/>';
    html += '<span>' + escape_html([detail.name, detail.caption].filter(Boolean).join('_')) + '</span></div>';
    html += '<div class="process-meta">';
    html += '<span class="process-li-progress">' + escape_html(progress_text(suc, total, package_progress, fail)) + '</span>';
    html += '<div class="package-progress"' + (package_progress.enabled ? '' : ' hidden') + '>';
    html += '<div class="package-progress-bar"><span style="width:' + package_progress_percent(package_progress) + '%"></span></div>';
    html += '<span class="package-progress-text">' + escape_html(package_progress_text(package_progress)) + '</span>';
    html += '</div>';
    html += '<span class="process-activity ' + escape_attr(activity.phase) + '">' + escape_html(activity.message) + '</span>';
    html += '</div>';
    html += '<div class="process-li-actions">';
    if (finished) {
        html += '<input type="button" class="process-li-stop" value="' + (fail > 0 || activity.phase === 'error' ? '结束' : '完成') + '" disabled>';
    } else if (stopped) {
        html += '<input type="button" class="process-li-stop is-resume" value="继续" data-action="resume">';
    } else {
        html += '<input type="button" class="process-li-stop" value="暂停" data-action="stop">';
    }
    html += '<input type="button" class="process-li-delete" value="删除">';
    html += '</div></div>';
    return html;
}

var events = {
        current_page: () => {
            chrome.runtime.sendMessage({type: 'current_page'})
        },
        send_message: (data,callback) => {
            if(typeof data  === 'string'){
                chrome.runtime.sendMessage({type: data},function(res){
                    typeof callback === 'function' && callback(res)
                })
            }else{
                chrome.runtime.sendMessage(data,function(res){
                    typeof callback === 'function' && callback(res)
                })
            }
        },
        down_album: (data) => {
            chrome.runtime.sendMessage({type: 'down_album', data: data}, function (res) {
                console.log('back res', res)
            })
        },
        album_get: (data) => {
            chrome.runtime.sendMessage({type: 'album_get', data: data}, function () {

            })
        },
        config_set:(data)=>{
            chrome.runtime.sendMessage({type: 'config_set', data: data}, function () {

            })
        },
        config_get:(data,callback)=>{
            chrome.runtime.sendMessage({type: 'config_get', data: data}, function (res) {
                typeof callback === 'function' && callback(res)

            })
        },
        window_set:(data,callback)=>{
            chrome.runtime.sendMessage({type: 'window_set', data: data}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        window_get:(data,callback)=>{
            chrome.runtime.sendMessage({type: 'window_get', data: data}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        down_resume:(callback)=>{
            chrome.runtime.sendMessage({type: 'down_resume'}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        get_all_progress:(callback)=>{
            chrome.runtime.sendMessage({type: 'get_all_progress'}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        album_stop:(album_id,callback)=>{
            chrome.runtime.sendMessage({type: 'album_stop', album_id: album_id}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        album_resume:(album_id,callback)=>{
            chrome.runtime.sendMessage({type: 'album_resume', album_id: album_id}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        },
        album_remove:(album_id,callback)=>{
            chrome.runtime.sendMessage({type: 'album_remove', album_id: album_id}, function (res) {
                typeof callback === 'function' && callback(res)
            })
        }
    }
;

chrome.runtime.onMessage.addListener(function (res, sender, sendResponse) {
    console.log('popup onMessage Listener', res);
    if (res && res.type === 'album_list') {
        try {
            let data = res.data;
            let list = data.list;
            let name = data.name;
            let user_id = data.uid;
            let html = '';
            let cover;
            let count;
            let uid;
            let album_id;
            let caption;
            let type;
            let empty_pic = 'https://img.t.sinajs.cn/t4/appstyle/photo/images/common/status_0.png';
            for (let i in list) {
                cover = list[i]['cover_pic'] ? list[i]['cover_pic'] : empty_pic;
                count = list[i]['count']['photos'];
                uid = list[i]['uid'];
                album_id = list[i]['album_id'];
                caption = list[i]['caption'];
                type = list[i]['type'];
                html += '<div class="item" title="' + escape_html(caption) + '" ' +
                    'data-uid="' + uid + '" ' +
                    'data-albid="' + album_id + '" ' +
                    'data-caption="' + escape_attr(caption) + '"  ' +
                    'data-name="' + escape_attr(name) + '"  ' +
                    'data-count="' + count + '"  ' +
                    'data-type="' + type + '">';
                html += '<img class="pic" src="' + escape_attr(cover) + '" />';
                html += '<span class="caption">' + escape_html(caption) + '</span>';
                html += '<span class="count">' + count + '</span>';
                html += '<span class="selected"></span>';
                html += '<span class="complete" id="' + album_id + '"></span>';
                html += '</div>'
            }
            $('.name').html('<span class="to-album" data-uid="' + user_id + '">当前用户：' + escape_html(name) + ' UID：' + user_id + '</span>');
            $('.album-list').html(html || '<div class="album-message">没有可下载的相册</div>').show();
            $('.album-loading').hide();
            set_loading_text('相册列表读取完成');
            suc_show();
        } catch (e) {
            $('.album-list').html('<div class="album-message">' + escape_html(e.toString()) + '</div>').show();
            $('.album-loading').hide();
            set_loading_text('相册列表渲染失败');
        }
    } else if (res && res.type === 'album_fail') {
        $('.album-list').html('<div class="album-message">' + escape_html(res.data) + '</div>').show();
        $('.album-loading').hide();
        set_loading_text(res.data || '相册读取失败');
        err_hide();
    } else if (res && res.type === 'user_list') {
        let list = res.data;
        let html = '';
        html += '<select class="album-select">';
        for (let i in list) {
            html += '<option value="' + list[i]['uid'] + '">' + escape_html(list[i]['name']) + '</option>';
        }
        html += '</select>';
        $('.user-list').html(html)
        suc_show();
    } else if (res && res.type === 'album_complete') {
        //{"album_id":3702951646344914,"suc":1,"fail":0,"album_detail":{"album_id":"3702951646344914","caption":"微博配图","cover_pic":"https://wx1.sinaimg.cn/thumb150/6d7d3a59gy1g7c352gw4cj21ok0qe0uj.jpg","type":3,"count":688,"name":"愤怒的熊喵酱"}}
        let data = res.data;
        let album_id = data.album_id;
        let uid = data.uid;
        let suc = parseInt(data.suc, 10) || 0;
        let fail = parseInt(data.fail, 10) || 0;
        let info = data.info;
        let album_detail = data.album_detail || {};
        album_detail.package_progress = data.package_progress;
        album_detail.activity = data.activity;
        album_detail.fail = fail;
        let total = parseInt(data.total || album_detail.count, 10) || 0;
        let handled = suc + fail;
        let progress_total = total > 0 ? total : handled;
        let finished = info === '下载完成' || info === '下载结束' || data.finished === true;
        $('#' + album_id).html(info ? info : (suc + ' / ' + progress_total)).show();
        if (finished) {
            set_download_status('complete');
        }
        let $li = $('.process-body #process' + album_id);
        if ($li.length === 0) {
            $('.process-body').append(render_process_li(album_id, uid, album_detail, suc, progress_total, finished));
        } else {
            update_process_progress($li, suc, progress_total, data.package_progress, data.activity, fail);
            if (finished) {
                $li.find('.process-li-stop').prop('disabled', true).val(fail > 0 ? '结束' : '完成').removeClass('is-resume');
            }
        }
        $('.process').show();
        // suc_show();
    } else if (res.type === 'pop_info') {
        let data = res.data;
        if (data.activity) {
            set_loading_text(data.activity);
        }
        if (data.time_avg) {
            if ($('.process-body #time_avg').length == 0) {
                $('.process-body').prepend('<div id="time_avg">');
            }
            $('.process-body #time_avg').html('每张平均下载耗时' + Math.round(data.time_avg /10)/1000+ 's，将以' + Math.round(data.time_avg)/1000 + 's 间隔翻页请求')
        }
    } else if (res && res.type === 'download_status') {
        set_download_status(res.data || 'idle');
    }
    sendResponse('done');
    return true
});

function err_hide() {
    $('.select-position').hide();
    $('.name').hide();
}

function suc_show() {
    $('.select-position').show();
    $('.name').show();

}

function set_download_status(state) {
    // no-op: per-album controls only
}

function set_loading_text(text) {
    $('.album-loading span').text(text || '正在读取相册');
}

function update_process_progress($li, suc, total, package_progress, activity, fail) {
    let progress = normalize_package_progress(package_progress);
    let current_activity = normalize_activity(activity);
    $li.find('.process-li-progress').text(progress_text(suc, total, progress, fail));
    let $package = $li.find('.package-progress');
    if (progress.enabled) {
        $package.prop('hidden', false);
        $package.find('.package-progress-bar span').css('width', package_progress_percent(progress) + '%');
        $package.find('.package-progress-text').text(package_progress_text(progress));
    } else {
        $package.prop('hidden', true);
    }
    let $activity = $li.find('.process-activity');
    $activity.removeClass('idle running complete error stopped').addClass(current_activity.phase);
    $activity.text(current_activity.message);
}

function normalize_package_progress(progress) {
    progress = progress || {};
    return {
        enabled: progress.enabled == 1 || progress.enabled === true,
        done: parseInt(progress.done, 10) || 0,
        total: parseInt(progress.total, 10) || 0,
        size: normalize_package_size(progress.size),
        processed: parseInt(progress.processed, 10) || 0,
        imageTotal: parseInt(progress.imageTotal, 10) || 0,
        currentIndex: parseInt(progress.currentIndex, 10) || 0,
        currentDone: parseInt(progress.currentDone, 10) || 0,
        currentTotal: parseInt(progress.currentTotal, 10) || 0
    };
}

function progress_text(suc, total, package_progress, fail) {
    suc = parseInt(suc, 10) || 0;
    total = parseInt(total, 10) || 0;
    fail = parseInt(fail, 10) || 0;
    if (package_progress && package_progress.enabled) {
        let image_total = package_progress.imageTotal || total;
        let text = '已保存 ' + suc + ' / ' + image_total + ' 张';
        if (package_progress.processed > suc) {
            text += '，已抓取 ' + package_progress.processed + ' 张';
        }
        return text + (fail > 0 ? ('，失败 ' + fail) : '');
    }
    return suc + ' / ' + total + (fail > 0 ? ('，失败 ' + fail) : '');
}

function package_progress_text(progress) {
    if (!progress || !progress.enabled) {
        return '';
    }
    let package_text = progress.total > 0 ? ('已打包 ' + progress.done + ' / ' + progress.total + ' 包') : ('已打包 ' + progress.done + ' 包');
    if (progress.currentIndex && progress.currentTotal) {
        return '正在处理第 ' + progress.currentIndex + ' 包 ' + progress.currentDone + ' / ' + progress.currentTotal + ' 张 · ' + package_text;
    }
    return package_text;
}

function package_progress_percent(progress) {
    if (!progress || !progress.enabled) {
        return 0;
    }
    if (progress.imageTotal > 0) {
        let percent = progress.processed / progress.imageTotal * 100;
        if (progress.processed > 0 && percent < 1) {
            return 1;
        }
        return Math.max(0, Math.min(100, Math.round(percent)));
    }
    if (progress.total > 0) {
        return Math.max(0, Math.min(100, Math.round(progress.done / progress.total * 100)));
    }
    return 0;
}

function normalize_package_size(value) {
    let size = parseInt(value, 10);
    if (!size || size < 1) {
        return 500;
    }
    return Math.min(size, 500);
}

function normalize_activity(activity) {
    activity = activity || {};
    return {
        message: activity.message || '等待后台任务',
        phase: activity.phase || 'idle'
    };
}

function toggle_package_size() {
    $("#package-size").prop('disabled', !$("#package-download").prop('checked'));
}

function escape_html(str) {
    return (str === undefined || str === null ? '' : str.toString())
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function escape_attr(str) {
    return escape_html(str);
}
