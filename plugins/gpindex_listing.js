'use strict';

const util = require('util');
const he = require('he');
const tags = require('../config.json')['gpindex_tags']
const langres = require('../resources/gpindex_listing.json');
const admin_id = require('../config.json')['gpindex_admin'];

var _e, comlib;

// TODO
function getList(msg, result, bot) {
    if (msg.chat.id > 0) {
        comlib.UserFlag.queryUserFlag(msg.from.id, 'block')
        .then((ret) => {
            if (!ret) {
                var row = [], i = 0;
                var col = [];
                tags.forEach((child) => {
                    col.push({text: child});
                    if (col.length == 3) {
                        row.push(col);
                        col = [];
                    }
                })
                if (col.length > 0) {
                    row.push(col);
                    col = [];
                }
                bot.sendMessage(msg.chat.id, langres['promptChooseTag'], {
                        reply_to_message_id: msg.message_id,
                    reply_markup: {keyboard: row}
                })
            } else {
                bot.sendMessage(msg.chat.id, langres['errorUserBanned']);
            }
        })
    }
}

function processText(msg, result, bot) {
    if (!comlib.getLock(msg.from.id) && msg.chat.id > 0) {
        if (tags.indexOf(msg.text) > -1) {
            comlib.UserFlag.queryUserFlag(msg.from.id, 'block')
            .then((ret) => {
                if (!ret) {
                    comlib.getRecByTag(msg.text)
                    .then((recs) => {
                        var outprefix = langres['infoGroups']; // Deprecated
                        var outmsg = [];
                        outmsg[0] = '';
                        var head = 0;
                        recs.forEach((child) => {
                            var link = 'https://t.me/' + _e.me.username + '?start=getdetail@' + child.id;
                            var line, prefix;
                            //out += util.format('<a href="%s">%s</a>\n', link, he.encode(child.title));
                            if (child.type == 'group' || child.type == 'supergroup') {
                                if (child.is_public) prefix = '👥🌐|';
                                  else prefix = '👥🔒|';
                            } else if (child.type == 'channel') {
                                if (child.is_public) prefix = '📢🌐|';
                                  else prefix = '📢🔒|';
                            }
                            if (child.extag) {
                                if (child.extag['official'] == 1) prefix += `<i>【${langres['tagOfficial']}】</i>|`;
                                  else if (child.extag['official'] == 2) prefix += `<i>【${langres['tagUnOfficial']}】</i>|`;
                            }
                            if (child.is_public) line = prefix + util.format(' <a href="https://t.me/%s">%s</a> (<a href="%s">详情</a>)\n', child.username, he.encode(child.title), link);
                              else line = prefix + util.format(' <a href="%s">%s</a> (<a href="%s">详情</a>)\n', child.invite_link, he.encode(child.title), link);
                            head++;
                            if (head <= 40) outmsg[outmsg.length - 1] += line;
                              else {
                                outmsg[outmsg.length] = line;
                                head = 1;
                              }
                        })
                        for (var i=0; i<outmsg.length; i++) {
                            bot.sendMessage(msg.chat.id, outmsg[i], {
                                parse_mode: 'HTML',
                                reply_to_message_id: msg.message_id,
                                disable_web_page_preview: true
                            }).catch((e) => {
                                var errorlog = '```\n' + util.inspect(e) + '```\n';
                                bot.sendMessage(msg.chat.id, '发生了一些错误。我们已将错误日志发送至管理员。');
                                bot.sendMessage(admin_id, errorlog, {
                                    parse_mode: 'Markdown'
                                });
                            })
                        }
                    })
                } else {
                    bot.sendMessage(msg.chat.id, langres['errorUserBanned']);
                }
            });
        }
    }
}

function getDetail(msg, result, bot) {
    comlib.UserFlag.queryUserFlag(msg.from.id, 'block')
    .then((ret) => {
        if (!ret) {
            comlib.getRecord(result[1])
            .then((ret) => {
                if (!ret) {
                    bot.sendMessage(msg.chat.id, langres['errorGroupNotExist']);
                } else {
                    if (ret.is_public) 
                        if (ret.type == "channel") {
                            bot.sendMessage(msg.chat.id, util.format(langres['infoPubChan'], ret.id, ret.title, ret.username, ret.tag, ret.desc), {
                            reply_markup: {inline_keyboard:[[{text: langres['buttonJoin'], url: 'https://t.me/' + ret.username}], [{text: langres['buttonReport'], callback_data: 'reportinvalid:' + ret.id}]]},
                                disable_web_page_preview: true
                            });
                        } else {
                            bot.sendMessage(msg.chat.id, util.format(langres['infoPubGroup'], ret.id, ret.title, ret.username, ret.tag, ret.desc), {
                                reply_markup: {inline_keyboard:[[{text: langres['buttonJoin'], url: 'https://t.me/' + ret.username}], [{text: langres['buttonReport'], callback_data: 'reportinvalid:' + ret.id}]]},
                                disable_web_page_preview: true
                            });
                        }
                    else 
                        bot.sendMessage(msg.chat.id, util.format(langres['infoPrivGroup'], ret.id, ret.title, ret.tag, ret.desc), {
                            reply_markup: {inline_keyboard:[[{text: langres['buttonJoin'], url: ret.invite_link}], [{text: langres['buttonReport'], callback_data: 'reportinvalid:' + ret.id}]]},
                            disable_web_page_preview: true
                        });
                }
            }).catch((e) => {
                var errorlog = '```\n' + util.inspect(e) + '```\n';
                bot.sendMessage(msg.chat.id, '发生了一些错误。');
                bot.sendMessage(admin_id, errorlog, {
                    parse_mode: 'Markdown'
                });
            })
        } else {
            bot.sendMessage(msg.chat.id, langres['errorUserBanned']);
        }
    });
}

function getMyGroups(msg, result, bot) {
    if (msg.chat.id > 0)
    comlib.getRecByCreator(msg.from.id)
    .then((recs) => {
        var out = '';
	if (recs)
        recs.forEach((rec) => {
            var line;
            line = rec.id;
            line += ' - ';
            line += rec.title + ` (#${rec.tag}): \n`;
            line += rec.is_public ? '@'+rec.username : rec.invite_link;
            out += line + '\n\n';
        });
	else out = 'No Groups.'
        bot.sendMessage(msg.chat.id, out, {
            reply_to_mesaage_id: msg.message_id
        });
    });
}

module.exports = {
    init: (e) => {
        _e = e;
        comlib = _e.libs['gpindex_common'];
    },
    run: [
        [/^\/list$/, getList],
        ['text', processText],
        [/^\/start getdetail@([0-9-]{6,})/, getDetail],
        [/^\/getdetail ([0-9-]{6,})/, getDetail],
        [/^\/mygroups$/, getMyGroups]
    ]
}
