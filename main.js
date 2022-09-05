const TelegramBot = require(`node-telegram-bot-api`)
const fs = require(`fs`)
const url = require(`url`)
const date = require('date-and-time');

const token = process.env.token
const dbpath = process.env.dbpath || `./database.json`
const checkinterval = isNaN(parseInt(process.env.checkinterval)) ? 60 : parseInt(process.env.checkinterval)

console.log(`checkinterval = ${checkinterval}`)
console.log(`dbpath = ${dbpath}`)
let db = null
try {
    db = require(dbpath)
} catch (error) {
    if (error.code === `MODULE_NOT_FOUND`) {
        console.info(`db not existent, creating it ...`)
        fs.writeFileSync(dbpath, JSON.stringify({}))
        db = {}
    } else {
        throw error
    }
}

const bot = new TelegramBot(token, {polling: true})
bot.on(`polling_error`, error => {
    if (error.code === `ETELEGRAM` && error.response.statusCode === 404) {
        console.error(error.message)
        console.error(`This is likely due to a invalid token.`)
        process.exit(1)
    }
    throw error
})

bot.onText(/\/check (.+)/, (msg, match) => {
    const checkUrl = msg.text.split(` `)[1]
    const chatId = msg.chat.id

    db[chatId] = checkUrl
    updateDb()

    bot.sendMessage(chatId, `Checking following URL:\n${db[chatId]}`)
})

function updateDb() {
    fs.writeFileSync(dbpath, JSON.stringify(db))
}

async function checker() {
    while (1) {
        for (const chatId in db) {
            const checkUrl = db[chatId]
            console.log(`Checking ${chatId}: ${checkUrl}`)

            const now = new Date()
            const dateString = date.format(now, `YYYY-MM-DD`)
            const parsed = url.parse(checkUrl, true)
            parsed.query[`start_date`] = dateString
            parsed.query['limit'] = 15
            const requestUrl = `https://www.doctolib.de/availabilities.json?start_date=${parsed.query['start_date']}&visit_motive_ids=${parsed.query['visit_motive_ids']}&agenda_ids=${parsed.query['agenda_ids']}&practice_ids=${parsed.query['practice_ids']}&limit=${parsed.query['limit']}`

            const response = await fetch(requestUrl)
            if (response.status === 400) {
                delete db[chatId]
                updateDb()
                await bot.sendMessage(chatId, `URL is invalid, not checking anymore.`)
            } else {
                const times = await response.json()
                if (times['total'] !== 0) {
                    const slots = times.availabilities.map(obj => obj.slots).flat()
                    console.log(slots)
                    await bot.sendMessage(chatId, `Following dates are available:\n${slots.join('\n')}`)
                    await bot.sendMessage(chatId, `I will stop checking the following url:`)
                    await bot.sendMessage(chatId, `${requestUrl}`)

                    delete db[chatId]
                    updateDb()

                }
            }
        }

        console.info(`Check done!`)
        await new Promise(resolve => setTimeout(resolve, checkinterval * 1000))
    }
}

checker()