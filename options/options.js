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

    fetch('https://weibo.com/ajax/profile/info', {
        method: 'GET',
        credentials: 'include',
        headers: {
            'Accept': 'application/json, text/plain, */*'
        }
    }).then(function (res) {
        if (res.ok) {
            $("#login_suc").show();
            $("#login_fail").hide();
        } else {
            $("#login_suc").hide();
            $("#login_fail").show();
        }
        $("#login_check").hide();
    }).catch(function () {
        $("#login_suc").hide();
        $("#login_fail").show();
        $("#login_check").hide();
    });
}
