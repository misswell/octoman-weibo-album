document.addEventListener('DOMContentLoaded', function () {
    events.current_page();

    $('body').on('click', '.item', function (elm) {

        let ratio = $("#ratio").val();
        let open = $("#open-folder:checked").val();
        let down_allow = $("#con-current").val();

        $(this).addClass('is-downloading');
        $(this).find('.complete').text('等待下载');

        let album_id = $(this).data('albid');
        let uid = $(this).data('uid');
        let caption = $(this).data('caption');
        let type = $(this).data('type');
        let name = $(this).data('name');

        let data = {
            album_id: album_id,
            uid: uid,
            caption: caption,
            type: type,
            name: name,
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
        let album_id = $(this).data('alid');
        window.open('https://photo.weibo.com/' + album_id);

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
        events.send_message('down_cancel',function(res){
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
                    'data-type="' + type + '">';
                html += '<img class="pic" src="' + escape_attr(cover) + '" />';
                html += '<span class="count">' + escape_html(caption) + ' ' + count + '</span>';
                html += '<span class="selected"></span>';
                html += '<span class="complete" id="' + album_id + '"></span>';
                html += '</div>'
            }
            $('.name').html('<span class="to-album" data-alid="' + user_id + '">当前用户：' + escape_html(name) + ' UID：' + user_id + '</span>');
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
        let suc = data.suc;
        let fail = data.fail;
        let info = data.info;
        let album_detail = data.album_detail;
        $('#' + album_id).html(info?info:(suc + '/' + fail)).show();
        if ($('.process #process' + album_id).length == 0) {
            $('.process').append('<div class="process-li" id="process' + album_id + '">');
        }
        let html = '';
        html += '<div class="album-info" ' +
            'data-uid="'+uid+'" data-alid="'+album_id+'"'+'" data-type="'+album_detail.type+'"' +
            '><img class="process-pic" src="' + escape_attr(album_detail.cover_pic) + '"/>';
        html += '<span>' + escape_html(album_detail.name + '_' + album_detail.caption) + '</span></div>';
        html += '<span>' + data.suc + ' / ' + album_detail.count + '</span>';
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
