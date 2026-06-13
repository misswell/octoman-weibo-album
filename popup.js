document.addEventListener('DOMContentLoaded', function () {
    events.current_page();
    set_download_status('idle');

    $('body').on('click', '.item', function (elm) {

        let ratio = $("#ratio").val();
        let open = $("#open-folder:checked").val();
        let down_allow = $("#con-current").val();

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
        };
        events.down_album(data)
    });

    $('body').on('change', 'select.album-select', function (elm) {
        let uid2 = $(this).val();
        let name2 = $.trim($(this).find('option:selected').text());
        // $('.user-select').html(uid2+name2);
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
    $("#down-pause").click(function(){
        events.down_pause(function(res){
            if(res===true){//暂停中
                $("#down-pause").val('继续');
            }else{
                $("#down-pause").val('暂停');
            }
        })
    });
    $("#down-cancel").click(function(){
        if ($(this).prop('disabled')) {
            return;
        }
        events.send_message('down_cancel',function(res){
            if (res === true) {
                $("#down-pause").val('暂停');
                set_download_status('stopped');
            }
        })
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

    events.window_get('down_pause',function(res){
        if(res===true){//暂停中
            $("#down-pause").val('继续')
            set_download_status('paused');
        }else{
            $("#down-pause").val('暂停')
        }
    });
    events.config_get('open_folder',function(res){
        $("#open-folder").prop('checked',res==1?true:false)
    });
    events.config_get('down_allow',function(res){
        $("#con-current").val(res)
    });
    events.window_get('download_status',function(res){
        set_download_status(res || 'idle');
    });
});

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
        down_pause:(callback)=>{
            chrome.runtime.sendMessage({type: 'down_pause'}, function (res) {
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
            suc_show();
        } catch (e) {
            $('.album-list').html('<div class="album-message">' + escape_html(e.toString()) + '</div>').show();
            $('.album-loading').hide();
        }
    } else if (res && res.type === 'album_fail') {
        $('.album-list').html('<div class="album-message">' + escape_html(res.data) + '</div>').show();
        $('.album-loading').hide();
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
        let total = parseInt(data.total || album_detail.count, 10) || 0;
        let handled = suc + fail;
        let progress_total = total > 0 ? total : handled;
        $('#' + album_id).html(info ? info : (suc + ' / ' + progress_total)).show();
        if (info === '下载完成') {
            set_download_status('complete');
        }
        if ($('.process #process' + album_id).length == 0) {
            $('.process').append('<div class="process-li" id="process' + album_id + '">');
        }
        let html = '';
        html += '<div class="album-info" ' +
            'data-uid="'+uid+'" data-alid="'+album_id+'"'+'" data-type="'+(album_detail.type || '')+'"' +
            '><img class="process-pic" src="' + escape_attr(album_detail.cover_pic || '') + '"/>';
        html += '<span>' + escape_html([album_detail.name, album_detail.caption].filter(Boolean).join('_')) + '</span></div>';
        html += '<span>' + suc + ' / ' + progress_total + '</span>';
        $('.process #process' + album_id).html(html)
        // suc_show();
    } else if (res.type === 'pop_info') {
        let data = res.data;
        if (data.time_avg) {
            if ($('.process #time_avg').length == 0) {
                $('.process').prepend('<div id="time_avg">');
            }
            $('.process #time_avg').html('每张平均下载耗时' + Math.round(data.time_avg /10)/1000+ 's，将以' + Math.round(data.time_avg)/1000 + 's 间隔翻页请求')
        }
    } else if (res && res.type === 'download_status') {
        set_download_status(res.data && res.data.status ? res.data.status : 'idle');
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

function set_download_status(status) {
    let running = status === 'running';
    let status_text = {
        idle: '暂无下载任务',
        running: '正在下载，可停止',
        paused: '已暂停，继续后可停止',
        stopped: '已停止',
        complete: '下载完成'
    };
    $('#down-cancel')
        .prop('disabled', !running)
        .toggleClass('is-disabled', !running)
        .attr('title', status_text[status] || status_text.idle);
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
