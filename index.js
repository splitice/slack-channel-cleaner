#!/usr/bin/env node
"use strict";
var request = require("request");
var inquirer = require("inquirer");
var Async = require("async");
var linqts_1 = require('linqts');
var colors = require('colors');
var moment = require('moment')
var Q = require('q')
colors.setTheme({
    input: 'grey',
    prompt: 'cyan',
    info: 'magenta',
    data: 'grey',
    warn: 'yellow',
    debug: 'white',
    error: 'red'
});
var start = false;
var slack = {
    url: 'https://slack.com/api/',
    token: '',
    api: {
        channels_list: 'conversations.list',
        channels_history: 'conversations.history',
        chat_delete: 'chat.delete'
    }
};
var _messageList;
Async.auto({
    getToken: function (next, data) {
        _messageList = [];
        if(process.env.SLACK_TOKEN){
            slack.token = process.env.SLACK_TOKEN
            next(null, process.env.SLACK_TOKEN)
            return
        }
        inquirer.prompt([{ message: "Enter your Slack API Token: ", type: "string", name: "token" }]).then(function (answer) {
            if (answer && answer.token) {
                slack.token = answer.token;
                return next(null, answer.token);
            }
            else {
                console.log(colors.error("Please enter your Slack API Token!!!"));
                return;
            }
        });
    },
    inputs: ['getToken', function (next, data) {
            request({ url: slack.url + slack.api.channels_list, qs: { token: slack.token, types:"public_channel,private_channel" }, timeout: 5000, json: true }, function (err, resp, reqData) {
                if (err || resp.statusCode != 200)
                    return err || new Error("Error: " + resp.statusCode);
                if (reqData.ok || reqData.ok == "true") {
                    var channels = reqData.channels;
                    var channelPrompt = new linqts_1.List(channels).Select(function (p) { return ({ name: p.name, id: p.id }); });
                    inquirer.prompt([{ message: colors.prompt("Delete selected channel records: "), type: "checkbox", name: "list", choices: channelPrompt.ToArray() }]).then(function (s) {
                        console.log(colors.info('Starting......................'));
                        var channelIdList = new linqts_1.List();
                        s.list.forEach(function (element) {
                            var channel = channelPrompt.First(function (k) { return k.name == element; });
                            channelIdList.Add(channel.id);
                        });
                        getHistoryMessage(channelIdList.ToArray(), 0);
                    });
                }
                else {
                    console.log(colors.error("Error: " + reqData.error));
                }
            });
        }]
});
function unixToDate(UNIX_timestamp){
    var a = new Date(UNIX_timestamp * 1000);
    return a
  }

function getHistoryMessage(data, index) {
    if (data.length > 0 && (data.length == index)) {
        return;
    }
    var e = data[index];
    const latest = moment().subtract(90, "days").unix()
    request({ url: slack.url + slack.api.channels_history, qs: { token: slack.token, channel: e, count: 100, latest}, timeout: 5000, json: true }, function (err, resp, reqData) {
        if (err || resp.statusCode != 200)
            return err || new Error("Error: " + resp.statusCode);
        if (reqData.ok || reqData.ok == "true") {
            var messages = reqData.messages;
            var messageList = new linqts_1.List(messages);
            console.log(colors.debug(" >> Fetching the channel history. ID: " + e + " / Count: " + messageList.Count() + " " + (messageList.Count() == 0 ? "- " + colors.error("Data not available") : "")));
            var currentTime = moment()
            messageList.ToArray().forEach(function (k) {
                const date = unixToDate(k.ts)
                if(currentTime.diff(moment(date), "days") > 90){
                    _messageList.push({ channelId: e, message: k });
                }
            });

            const deferred = Q.defer()
            
            if(_messageList[0]){
                removeHistoryMessage(0, deferred)
            }

            deferred.promise.then(function(){
                _messageList = []
                getHistoryMessage(data, index)
            })
        }
        else {
            console.log(colors.error("Error: " + reqData.error));
        }
    });
            
}
function removeHistoryMessage(index, deferred) {
    if (_messageList.length - 1 == index) {
        deferred.resolve()
        console.log(colors.info("Done.........."));
        return;
    }
    var e = _messageList[index];
    request({ url: slack.url + slack.api.chat_delete, qs: { token: slack.token, channel: e.channelId, ts: e.message.ts }, timeout: 5000, json: true }, async function (err, resp, reqData) {
        if (err || resp.statusCode != 200) {
            var i = index + 1;
            removeHistoryMessage(i, deferred);
        }
        if (reqData.ok || reqData.ok == "true") {
            console.log(colors.data(" >>>> Message deleted. > Message Timestamp: " + e.message.ts + " / Index: " + index + " - Message Count: " + _messageList.length));
            var i = index + 1;
            await Q.delay(25)
            removeHistoryMessage(i, deferred);
        }
        else {
            console.log(colors.error("Error: " + reqData.error));
        }
    });
}
