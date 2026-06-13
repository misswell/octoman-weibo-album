chrome.runtime.onMessage.addListener(function (res, sender, sendResponse) {
    console.log('common onMessage Listener', res);
    if (res && res.type === 'tabs') {
        let url = res.data.url;
        let param = getUrlParams(url);
        let domain = getUrlDomain(url);
        console.log('domain is', domain,'param is',param);
        if (uid_from_url(url)) {
            wb_info_fallback(url);
            sendResponse('done');
            return true
        }
        wb_info_old(function(res){
            console.log("res",res)
            if(res === false){
                wb_info_new(function(newRes){
                    if (newRes === false) {
                        wb_info_fallback(url);
                    }
                });
            }
		});
    }
    sendResponse('done');
    return true
});

var events = {
    tabs: function () {
        //获取当前页面链接
        chrome.runtime.sendMessage({type: 'tabs'}, function (tabs) {
            console.log('sendMessage：tabs', tabs)
        });
    },
    album_get:function(list){
        //获取当前页面链接
        chrome.runtime.sendMessage({type: 'album_get',data:list}, function (res) {
            console.log('sendMessage：album_get', res)
        });
    },
    album_list:function(list){
        //获取当前页面链接
        chrome.runtime.sendMessage({type: 'album_list',data:list}, function (res) {
            console.log('sendMessage：album_list', res)
        });
    },
    album_fail:function(info){
        chrome.runtime.sendMessage({type: 'album_fail',data:info}, function (res) {
            console.log('sendMessage：album_fail', res)
        });
    },
    user_list:function(list){
        //获取当前页面链接
        chrome.runtime.sendMessage({type: 'user_list',data:list}, function (res) {
            console.log('sendMessage：user_list', res)
        });
    },
};

user_list = [];
function wb_info_old(cb){

    var all = $(".WB_face .face a");
    if(all && all.length>0){
        let list = [];
        let uid_temp;
        let name_temp;
        all.each(function(){
            name_temp = $(this).attr('title');
            var usercard = $(this).find('img').attr('usercard');
            var param = getParams(usercard);
            uid_temp = param['id'];
            var exist = list.findIndex(function(item){
                return item['uid'] === uid_temp;
            });
            if(exist === -1){
                list.push({uid:uid_temp,name:name_temp})
            }
        });
        if(list.length>0){
            events.user_list(list);
            events.album_get(list[0]);
            console.log(list);
            window.user_list = list
        }else{
            events.album_fail('当前页面找不到用户（请等页面加载完成）')
        }
		typeof(cb) === "function" && cb(true)
    }else{
		typeof(cb) === "function" && cb(false)
	}
}

function wb_info_new(cb){

    var all = $(".vue-recycle-scroller__item-view");
    if(all && all.length>0){
        let list = [];
        let uid_temp;
        let name_temp;
        all.each(function(){
            name_temp = $(this).find("header .woo-box-item-flex a span").attr('title');
            uid_temp = $(this).find("header .woo-box-item-flex a").attr('href');
            uid_temp = uid_temp ? uid_temp.replace("\/u\/","").replace(/^https?:\/\/weibo.com\/u\//, "") : '';
            var exist = list.findIndex(function(item){
                return item['uid'] === uid_temp;
            });
            if(uid_temp && exist === -1){
                list.push({uid:uid_temp,name:name_temp || uid_temp})
            }
        });
        if(list.length>0){
            events.user_list(list);
            events.album_get(list[0]);
            console.log(list);
            window.user_list = list
            typeof(cb) === "function" && cb(true)
        }else{
            typeof(cb) === "function" && cb(false)
        }
    }else{
        typeof(cb) === "function" && cb(false)
    }
}

function wb_info_fallback(url) {
    let uid = uid_from_url(url);
    let name = name_from_page(uid);
    if (!uid) {
        uid = uid_from_links();
    }
    if (uid) {
        let list = [{uid: uid, name: name || uid}];
        console.log('wb_info_fallback target', {uid: uid, name: name, url: url});
        events.user_list(list);
        events.album_get(list[0]);
        console.log(list);
        window.user_list = list
    } else {
        events.album_fail('当前页面找不到用户（请等页面加载完成）')
    }
}

function uid_from_url(url) {
    let matched;
    if (!url) {
        return '';
    }
    matched = url.match(/photo\.weibo\.com\/(\d+)/);
    if (matched && matched[1]) {
        return matched[1];
    }
    matched = url.match(/weibo\.com\/u\/(\d+)/);
    if (matched && matched[1]) {
        return matched[1];
    }
    matched = url.match(/weibo\.com\/(\d+)/);
    if (matched && matched[1]) {
        return matched[1];
    }
    return '';
}

function uid_from_links() {
    let uid = '';
    $('a[href*="/u/"]').each(function () {
        let href = $(this).attr('href') || '';
        let matched = href.match(/\/u\/(\d+)/);
        if (matched && matched[1]) {
            uid = matched[1];
            return false;
        }
    });
    return uid;
}

function name_from_page(uid) {
    let name = $('title').text() ||
        $('[title][href*="/u/' + uid + '"]').first().attr('title') ||
        $('a[href*="/u/' + uid + '"] span[title]').first().attr('title') ||
        $('[href*="/u/' + uid + '"]').first().text();
    name = $.trim(name || '');
    name = name
        .replace(/的专辑\s*-\s*微相册.*$/, '')
        .replace(/的相册\s*-\s*微相册.*$/, '')
        .replace(/[\s_-]*微相册.*$/, '')
        .replace(/的微博.*$/, '')
        .replace(/微博.*$/, '')
        .replace(/[\s_-]*微博个人主页.*$/, '')
        .replace(/[\s_-]*Weibo.*$/, '');
    name = name.replace(/^@\s*/, '');
    return name;
}
