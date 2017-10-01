const langCodeBanned = ['fa-IR']
const halal_display_name = /sharma/i
const max_halal_char_threshold = 40
const max_halal_pct_threshold = 0.67
const send_capture_threshold = 120
const send_notification_threshold = 120
const kick_wait_threshold = 30

const chan_capture = -1001135234856
var _e, comlib, _ga
let last_sent_group = {}
let last_sent_capture = {}
let last_kicked = {}
let sticker_pack_name_cache = {}
let tempwhitelist = {}
const util = require('util')
const ADMIN_GROUP = require('../config.gpindex.json')['gpindex_admin']

function genHalalKB(id) {
    return {
        inline_keyboard: [
            [{
                text: '上交给真主安拉',
                callback_data: 'antihalal:h&' + id
            }],
            [{
                text: '不，这不清真',
                callback_data: 'antihalal:nh&' + id
            }]
        ]
    }
}

function genHalalKB_G(gid, uid) {
    return {
        inline_keyboard: [
            [{
                text: '不，这不清真',
                callback_data: 'antihalal:gnh&' + uid
            }]
        ]
    }
}

async function uploadHalal(msg, bot) {
    let send = false
    if (last_sent_capture[msg.from.id.toString()]) {
        if ((Math.floor(new Date().valueOf() / 1000) - last_sent_capture[msg.from.id.toString()]) > send_capture_threshold * 1000) {
            send = true
        }
    } else {
        send = true
    }
    if (send) {
        let result = await bot.forwardMessage(chan_capture, msg.chat.id, msg.message_id)
        await bot.sendMessage(chan_capture, `${util.inspect(msg.chat)}\n\n${util.inspect(msg.from)}`, {
            reply_to_message_id: result.message_id,
            reply_markup: genHalalKB(msg.from.id)
        })
        last_sent_capture[msg.from.id.toString()] = msg.date
    }
}

function testHalal(str) {
    let string = str.replace(/[\s\uFEFF\xA0]+/g, '')
    let len = string.length,
        count = 0
    for (let i = 0; i < len; ++i) {
        let char = string.charCodeAt(i)
        switch (true) {
            case char >= 0x600 && char <= 0x6ff:
            case char >= 0x750 && char <= 0x77f:
            case char >= 0x8a0 && char <= 0x8ff:
            case char >= 0x900 && char <= 0x97f:
            case char >= 0x600 && char <= 0x6ff:
            case char >= 0xa8e0 && char <= 0xa8ff:
            case char >= 0xfb50 && char <= 0xfdff:
            case char >= 0xfe70 && char <= 0xfeff:
                ++count
        }
        if (count >= max_halal_char_threshold)
            return true
    }
    if ((count / len) >= max_halal_pct_threshold)
        return true
    return false
}

async function privateLanguageDetection(msg, bot) {
    if (langCodeBanned.indexOf(msg.from.language_code) > -1) {
        _ga.tEvent(msg.from, 'antiHalal', 'antiHalal.languageBanned')
        let send = false
        if (last_sent_capture[msg.from.id.toString()]) {
            if ((Math.floor(new Date().valueOf() / 1000) - last_sent_capture[msg.from.id.toString()]) > send_capture_threshold * 1000) {
                send = true
            }
        } else {
            send = true
        }
        if (send) {
            let result = await bot.forwardMessage(chan_capture, msg.chat.id, msg.message_id)
            await bot.sendMessage(chan_capture, `Private Chat\n\n${util.inspect(msg.from)}\n\n已经根据语言上交给安拉。`, {
                reply_to_message_id: result.message_id
            })
            last_sent_capture[msg.from.id.toString()] = msg.date
        }
        // bot.sendMessage(msg.from.id, '抱歉，您无权使用此服务。')
        await comlib.UserFlag.setUserFlag(msg.from.id, 'block', 1)
        await comlib.UserFlag.setUserFlag(msg.from.id, 'halal', 1)
        return true
    }
}

async function examineDisplayName(msg, new_member, bot) {
    let display_name = new_member.first_name + (new_member.last_name || '')
    const is_kick_halal_name = !!(await comlib.GroupExTag.queryGroupExTag(msg.chat.id, 'feature:antihalalenhanced'))
    let is_halal = testHalal(display_name) || !!display_name.match(halal_display_name)
    if (is_halal) {
        _ga.tEvent(msg.from, 'antiHalal', 'antiHalal.display-name')
        await bot.sendMessage(chan_capture, `清真加群\n\n${util.inspect(msg.chat)}\n搞事的人\n${util.inspect(msg.from)}\n清真\n${util.inspect(new_member)}`, {
            reply_markup: genHalalKB(new_member.id)
        })
        if (is_kick_halal_name) {
            kickByHalal(msg.chat, new_member, false, bot)
        }
    }
}

async function examineSticker(msg, bot) {
    let display_name = msg.from.first_name + (msg.from.last_name || '')
    let stickerset = msg.sticker.set_name
    let stickersetname = sticker_pack_name_cache[stickerset] || (await bot.getStickerSet(stickerset)).title
    sticker_pack_name_cache[stickerset] = stickersetname
    let is_halal = testHalal(stickersetname) || testHalal(display_name + stickersetname)
    if (is_halal) {
        _ga.tEvent(msg.from, 'antiHalal', 'antiHalal.sticker')
        await uploadHalal(msg, bot)
        if (!tempwhitelist[msg.chat.id.toString() + msg.from.id.toString()])
            await kickByHalal(msg.chat, msg.from, false, bot)
        return true
    }
    return false
}

async function examineNormalMsg(msg, bot) {
    let need_test = ''
    let display_name = msg.from.first_name + (msg.from.last_name || '')
    need_test += display_name
    if (msg.text) need_test += msg.text
    if (msg.caption) need_test += msg.caption
    if (msg.forward_from_chat) need_test += msg.forward_from_chat.title
    let is_halal = testHalal(need_test)
    if (is_halal) {
        _ga.tEvent(msg.from, 'antiHalal', 'antiHalal.normal-msg')
        await uploadHalal(msg, bot)
        if (!tempwhitelist[msg.chat.id.toString() + msg.from.id.toString()])
            await kickByHalal(msg.chat, msg.from, false, bot)
        return true
    }
    return false
}

async function kickByHalal(group, user, is_flag, bot) {
    const is_halal_process_enabled = !!(await comlib.GroupExTag.queryGroupExTag(group.id, 'feature:antihalal'))
    if (is_halal_process_enabled) {
        let usermsg = `清真用户：<a href="tg://user?id=${user.id}">${user.first_name || ''}`
        if (user.last_name) usermsg += ` ${user.last_name || ''}`
        usermsg += `</a> (${user.id})`
        try {
            if (last_kicked[group.id.toString() + user.id.toString()]) {
                if ((Math.floor(new Date().valueOf() / 1000) - last_kicked[group.id.toString() + user.id.toString()]) > kick_wait_threshold * 1000) {
                    await bot.kickChatMember(group.id, user.id)
                    last_kicked[group.id.toString() + user.id.toString()] = Math.floor(new Date().valueOf() / 1000)
                }
            } else {
                await bot.kickChatMember(group.id, user.id)
                last_kicked[group.id.toString() + user.id.toString()] = Math.floor(new Date().valueOf() / 1000)
            }
            let send = false
            if (last_sent_group[group.id.toString() + user.id.toString()]) {
                if ((Math.floor(new Date().valueOf() / 1000) - last_sent_group[group.id.toString() + user.id.toString()]) > send_notification_threshold * 1000) {
                    send = true
                }
            } else {
                send = true
            }
            if (send) {
                let message = !is_flag ? `#HALAL #ENFORCED 已检测到一个清真并且吃掉了。如果出现误报请群组管理员点击下面的按钮临时解封并上报。\n\n${usermsg}` : `#HALAL #ENFORCED 已检测到一个清真并且吃掉了。如果出现误处理请联系工单加入清真白名单。\nTGCN-工单系统：@tgcntkbot\n\n${usermsg}`
                await bot.sendMessage(group.id, message, {
                    parse_mode: 'HTML',
                    reply_markup: is_flag ? null : genHalalKB_G(group.id, user.id)
                })
                _ga.tEvent(user, 'antiHalal', 'antiHalal.kicked')
                last_sent_group[group.id.toString() + user.id.toString()] = Math.floor(new Date().valueOf() / 1000)
            }
        } catch (e) {
            let send = false
            if (last_sent_group[group.id.toString() + user.id.toString()]) {
                if ((Math.floor(new Date().valueOf() / 1000) - last_sent_group[group.id.toString() + user.id.toString()]) > send_notification_threshold * 1000) {
                    send = true
                }
            } else {
                send = true
            }
            if (send) {
                await bot.sendMessage(group.id, `#HALAL 已检测到一个清真，如果出现误处理请联系工单加入清真白名单。如需自动吃掉，请授予机器人封禁用户的权限。\nTGCN-工单系统：@tgcntkbot\n\n${usermsg}`, {
                    parse_mode: 'HTML'
                })
                _ga.tEvent(user, 'antiHalal', 'noSpam.kick-fail')
                last_sent_group[group.id.toString() + user.id.toString()] = Math.floor(new Date().valueOf() / 1000)
            }
        }
    }
}

async function preProcessStack(msg, bot) {
    try {
        const non_halal = !!(await comlib.UserFlag.queryUserFlag(msg.from.id, 'nothalal'))
        if (non_halal) return
        let is_halal
        if (msg.chat.id > 0) {
            return await privateLanguageDetection(msg, bot)
        } else if (msg.new_chat_members) {
            for (let member of msg.new_chat_members) {
                const halal = !!(await comlib.UserFlag.queryUserFlag(member.id, 'halal'))
                if (halal) {
                    await kickByHalal(msg.chat, member, true, bot)
                    is_halal = true
                } else {
                    await examineDisplayName(msg, member, bot)
                }
            }
        } else if (!msg.left_chat_member) {
            const halal = !!(await comlib.UserFlag.queryUserFlag(msg.from.id, 'halal'))
            if (halal) {
                await kickByHalal(msg.chat, msg.from, true, bot)
                is_halal = true
            }
            if (msg.sticker) {
                // is_halal = await examineSticker(msg, bot) || is_halal
            } else {
                is_halal = await examineNormalMsg(msg, bot) || is_halal
            }
        }
        if (is_halal) {
            const is_halal_process_enabled = !!(await comlib.GroupExTag.queryGroupExTag(msg.chat.id, 'feature:antihalal'))
            if (is_halal_process_enabled) {
                try {
                    await bot.deleteMessage(msg.chat.id, msg.message_id)
                } catch (e) {}
            }
        }
    } catch (e) {
        console.error(e.stack)
    }
}

async function processCallbackQuery(msg, type, bot) {
    const [operator, query] = msg.data.split(':')
    if (operator == 'antihalal') {
        let [q, uid] = query.split('&')
        uid = parseInt(uid)
        const is_superadmin = !(['left', 'kicked'].indexOf((await bot.getChatMember(ADMIN_GROUP, msg.from.id)).status) > -1)
        switch (q) {
            case 'h':
                if (is_superadmin) {
                    await comlib.UserFlag.setUserFlag(uid, 'block', 1)
                    await comlib.UserFlag.setUserFlag(uid, 'halal', 1)
                    await bot.editMessageText(`${msg.message.text}\n\n✅已经上交给了真主安拉。老阿訇：${msg.from.first_name} ${msg.from.last_name}`, {
                        chat_id: msg.message.chat.id,
                        message_id: msg.message.message_id,
                    })
                    return await bot.answerCallbackQuery(msg.id, '已经上交给了真主安拉。')
                } else {
                    return await bot.answerCallbackQuery(msg.id, '你不是老阿訇。')
                }
            case 'nh':
                if (is_superadmin) {
                    await comlib.UserFlag.setUserFlag(uid, 'halal', 0)
                    await comlib.UserFlag.setUserFlag(uid, 'nothalal', 1)
                    await bot.editMessageText(`${msg.message.text}\n\n✅好的，这不清真。老阿訇：${msg.from.first_name} ${msg.from.last_name}`, {
                        chat_id: msg.message.chat.id,
                        message_id: msg.message.message_id,
                    })
                    return await bot.answerCallbackQuery(msg.id, '好的，这不清真。')
                } else {
                    return await bot.answerCallbackQuery(msg.id, '你不是老阿訇。')
                }
            case 'gnh':
                const is_groupadmin = (['creator', 'administrator'].indexOf((await bot.getChatMember(parseInt(q[2]), msg.from.id)).status) > -1)
                if (is_superadmin || is_groupadmin) {
                    await bot.editMessageText(`${msg.message.text}\n\n✅好的，这不清真。阿訇：${msg.from.first_name} ${msg.from.last_name}`, {
                        chat_id: msg.message.chat.id,
                        message_id: msg.message.message_id,
                    })
                    await bot.sendMessage(chan_capture, `${util.inspect(msg.message.chat)}\n管理员 ${msg.from.first_name} ${msg.from.last_name} \n 表示 ${uid} 不清真`)
                    tempwhitelist[msg.chat.id.toString() + msg.from.id.toString()] = true
                    try {
                        await bot.unbanChatMember(msg.message.chat.id, uid)
                    } catch (e) {}
                    return await bot.answerCallbackQuery(msg.id, '好的，这不清真。')
                } else {
                    return await bot.answerCallbackQuery(msg.id, '你不是阿訇。')
                }
        }
    }
}

module.exports = {
    init: (e) => {
        _e = e;
        comlib = _e.libs['gpindex_common'];
        _ga = e.libs['ga'];
    },
    preprocess: preProcessStack,
    run: [
        ['callback_query', processCallbackQuery]
    ]
}
