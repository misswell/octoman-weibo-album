var WEIBO_HOME = 'https://weibo.com/';

$("#login-btn").click(function (event) {
    event.preventDefault();
    window.open(WEIBO_HOME);
});

$(function () {
    login_status();
});

function login_status() {
    $("#login_check").show();
    $("#login_suc").hide();
    $("#login_fail").hide();

    if (!chrome.cookies || !chrome.cookies.get) {
        $("#login_suc").hide();
        $("#login_fail").show();
        $("#login_check").hide();
        return;
    }
    chrome.cookies.get({url: WEIBO_HOME, name: 'SUB'}, function (cookie) {
        if (cookie && cookie.value) {
            $("#login_suc").show();
            $("#login_fail").hide();
        } else {
            $("#login_suc").hide();
            $("#login_fail").show();
        }
        $("#login_check").hide();
    });
}
